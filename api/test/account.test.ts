import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { bunDriver, createHarness, memoryStore, PASSWORD, registerAndLogin } from './harness';
import { CLEANUP_GRACE_MS, sweepCleanupTasks, sweepDeletions, UPLOAD_LEASE_MS } from '../src/account/service';

type H = ReturnType<typeof createHarness>;

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const png = (extra = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, extra]);
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const count = (h: H, table: string, where = '1=1') =>
  (h.sqlite.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;

const remove = (h: H, cookie: string | undefined, body: unknown) =>
  h.raw('/v1/account', {
    method: 'DELETE',
    cookie,
    body: enc(body),
    headers: { 'content-type': 'application/json' },
  });

async function putImage(h: H, cookie: string, name: string, bytes: Uint8Array) {
  const res = await h.raw(`/v1/images/${name}`, {
    method: 'PUT',
    cookie,
    body: bytes,
    headers: { 'x-content-sha256': sha(bytes), 'content-type': 'image/png' },
  });
  expect(res.status).toBe(200);
}

async function pushNote(h: H, cookie: string, id: string) {
  const res = await h.request('/v1/sync/push', {
    headers: { cookie },
    body: {
      changes: [
        {
          entity: 'notes',
          id,
          opId: `op-${id}`,
          baseSeq: null,
          data: {
            folder_id: null,
            title: 'ノート',
            body: '本文',
            pinned: 0,
            created_at: 1,
            updated_at: 1,
            deleted_at: null,
          },
        },
      ],
    },
  });
  return res.status;
}

async function setup() {
  const h = createHarness();
  const a = await registerAndLogin(h, 'a@example.com');
  const b = await registerAndLogin(h, 'b@example.com');
  const idOf = (email: string) =>
    (h.sqlite.query('SELECT id FROM user WHERE email = ?').get(email) as { id: string }).id;
  expect(await pushNote(h, a, 'n-a')).toBe(200);
  expect(await pushNote(h, b, 'n-b')).toBe(200);
  await putImage(h, a, 'a1.png', png(1));
  await putImage(h, b, 'b1.png', png(2));
  return { h, a, b, idA: idOf('a@example.com'), idB: idOf('b@example.com') };
}

describe('アカウント情報', () => {
  test('メールとログイン方法を返す。未ログインは401', async () => {
    const { h, a } = await setup();
    const res = await h.request('/v1/account', { headers: { cookie: a } });
    const body = (await res.json()) as any;
    expect(body.email).toBe('a@example.com');
    expect(body.providers).toEqual(['credential']);
    expect((await h.request('/v1/account')).status).toBe(401);
  });
});

describe('アカウント削除: 本人確認', () => {
  test('未ログインは401', async () => {
    const { h } = await setup();
    expect((await remove(h, undefined, { confirm: true })).status).toBe(401);
  });

  test('確認なし・パスワードなし・誤ったパスワードでは何も削除しない', async () => {
    const { h, a } = await setup();
    expect((await remove(h, a, {})).status).toBe(400);
    expect((await remove(h, a, { confirm: true })).status).toBe(403);
    expect((await remove(h, a, { confirm: true, password: 'wrong-password-1' })).status).toBe(403);
    expect(count(h, 'user')).toBe(2);
    expect(count(h, 'account_deletions')).toBe(0);
    expect(h.objects.size).toBe(2);
  });

  test('パスワードの誤りを繰り返すと制限される', async () => {
    const { h, a } = await setup();
    for (let i = 0; i < 5; i++) {
      expect((await remove(h, a, { confirm: true, password: 'wrong-password-1' })).status).toBe(403);
    }
    // 正しいパスワードでも制限中は拒否
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(429);
    expect(count(h, 'user')).toBe(2);
  });

  test('ソーシャルのみのアカウントは直近のログインが必要', async () => {
    const { h, a, idA } = await setup();
    h.sqlite.run("UPDATE account SET provider_id = 'google', password = NULL WHERE user_id = ?", [idA]);
    h.sqlite.run('UPDATE session SET created_at = 0 WHERE user_id = ?', [idA]);
    const stale = await remove(h, a, { confirm: true });
    expect(stale.status).toBe(403);
    expect(((await stale.json()) as any).error).toBe('reauth_required');
    expect(count(h, 'user')).toBe(2);

    h.sqlite.run('UPDATE session SET created_at = ? WHERE user_id = ?', [Date.now(), idA]);
    expect((await remove(h, a, { confirm: true })).status).toBe(200);
    expect(count(h, 'user', `id = '${idA}'`)).toBe(0);
  });
});

describe('アカウント削除: 実行', () => {
  test('D1・R2・認証情報を削除し、削除後はアクセスできない', async () => {
    const { h, a, idA } = await setup();
    const res = await remove(h, a, { confirm: true, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).deleted).toBe(true);

    for (const t of ['user', 'session', 'account', 'sync_records', 'sync_counters', 'image_objects']) {
      const col = t === 'user' ? 'id' : 'user_id';
      expect(count(h, t, `${col} = '${idA}'`)).toBe(0);
    }
    expect([...h.objects.keys()].some((k) => k.startsWith(`u/${idA}/`))).toBe(false);
    expect(count(h, 'account_deletions', `user_id = '${idA}' AND completed_at IS NOT NULL`)).toBe(1);
    // 古いCookieでは何もできない(同期の再開・画像の再アップロードも不可)
    expect(await pushNote(h, a, 'n-again')).toBe(401);
    expect((await h.request('/v1/sync/pull?cursor=0', { headers: { cookie: a } })).status).toBe(401);
    expect((await h.request('/api/auth/sign-in/email', { body: { email: 'a@example.com', password: PASSWORD } })).status).not.toBe(200);
  });

  test('他アカウントのデータは削除されない', async () => {
    const { h, a, b, idB } = await setup();
    await remove(h, a, { confirm: true, password: PASSWORD });
    expect(count(h, 'user', `id = '${idB}'`)).toBe(1);
    expect(count(h, 'sync_records', `user_id = '${idB}'`)).toBe(1);
    expect(count(h, 'image_objects', `user_id = '${idB}'`)).toBe(1);
    expect(h.objects.size).toBe(1);
    const pull = await h.request('/v1/sync/pull?cursor=0', { headers: { cookie: b } });
    expect(pull.status).toBe(200);
    const img = await h.raw('/v1/images/b1.png', { method: 'GET', cookie: b });
    expect(img.status).toBe(200);
  });

  test('R2の削除に失敗したら成功を返さず、アカウントは残り、再試行で完了する', async () => {
    const { h, a, idA } = await setup();
    h.faults.deletePrefix = true;
    const failed = await remove(h, a, { confirm: true, password: PASSWORD });
    expect(failed.status).toBe(500);
    expect(((await failed.json()) as any).error).toBe('delete_incomplete');
    expect(count(h, 'user', `id = '${idA}'`)).toBe(1); // 再試行できるようセッションも残る
    expect(count(h, 'account_deletions', `user_id = '${idA}'`)).toBe(1);

    // 削除の途中でも、他端末からの同期・アップロードは拒否される(再出現しない)
    expect(await pushNote(h, a, 'n-late')).toBe(401);
    const upload = await h.raw('/v1/images/late.png', {
      method: 'PUT',
      cookie: a,
      body: png(9),
      headers: { 'x-content-sha256': sha(png(9)), 'content-type': 'image/png' },
    });
    expect(upload.status).toBe(401);

    h.faults.deletePrefix = false;
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    expect(count(h, 'user', `id = '${idA}'`)).toBe(0);
    expect([...h.objects.keys()].some((k) => k.startsWith(`u/${idA}/`))).toBe(false);
  });

  test('削除は冪等(二重送信しても他へ影響しない)', async () => {
    const { h, a, idB } = await setup();
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(401);
    expect(count(h, 'user', `id = '${idB}'`)).toBe(1);
  });

  test('user削除後のR2の残骸は定期掃除で消える', async () => {
    const { h, idA } = await setup();
    h.sqlite.run('DELETE FROM user WHERE id = ?', [idA]);
    h.sqlite.run('INSERT INTO account_deletions (user_id, requested_at) VALUES (?, 1)', [idA]);
    h.objects.set(`u/${idA}/orphan`, png());
    const done = await sweepDeletions(bunDriver(h.sqlite), memoryStore(h.objects), 5);
    expect(done).toBe(1);
    expect([...h.objects.keys()].some((k) => k.startsWith(`u/${idA}/`))).toBe(false);
    expect(h.objects.size).toBe(1); // 他ユーザーの画像は残る
    expect(await sweepDeletions(bunDriver(h.sqlite), memoryStore(h.objects), 6)).toBe(0);
  });
});

const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
};
/** 掃除タスクの保証期間(リース + 猶予)が過ぎた時刻 */
const afterGuarantee = () => Date.now() + UPLOAD_LEASE_MS + CLEANUP_GRACE_MS + 1000;
const tick =() => new Promise((r) => setTimeout(r, 20));
const userObjects = (h: H, id: string) => [...h.objects.keys()].filter((k) => k.startsWith(`u/${id}/`));

describe('アカウント削除と画像アップロードの競合', () => {
  const upload = (h: H, cookie: string, name: string, bytes: Uint8Array) =>
    h.raw(`/v1/images/${name}`, {
      method: 'PUT',
      cookie,
      body: bytes,
      headers: { 'x-content-sha256': sha(bytes), 'content-type': 'image/png' },
    });

  test('本文の読み込み中に削除が完了しても、再開したアップロードは拒否され、R2に残らない', async () => {
    const { h, a, idA } = await setup();
    const bytes = png(7);
    let push!: (c: Uint8Array) => void;
    let close!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        push = (c) => ctrl.enqueue(c);
        close = () => ctrl.close();
      },
    });
    // 本文を途中で止めたPUT(認証ミドルウェアは通過済み)
    const pending = h.app.request(`${h.baseURL}/v1/images/slow.png`, {
      method: 'PUT',
      headers: {
        cookie: a,
        'cf-connecting-ip': '10.9.9.9',
        'x-content-sha256': sha(bytes),
        'content-type': 'image/png',
      },
      body,
      duplex: 'half',
    } as RequestInit);
    push(bytes.slice(0, 4));
    await tick();

    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    expect(userObjects(h, idA)).toEqual([]);

    push(bytes.slice(4));
    close();
    expect((await pending).status).toBe(401);
    expect(userObjects(h, idA)).toEqual([]);
    expect(count(h, 'image_objects', `user_id = '${idA}'`)).toBe(0);
  });

  test('R2書き込み中に削除が始まると、削除は完了せず、書き込み側が取り消し、再試行で完了する', async () => {
    const { h, a, idA, idB } = await setup();
    const g = gate();
    h.faults.beforePut = g.promise;
    const pending = upload(h, a, 'racing.png', png(8));
    await tick();
    expect(count(h, 'image_uploads', `user_id = '${idA}'`)).toBe(1);

    const first = await remove(h, a, { confirm: true, password: PASSWORD });
    expect(first.status).toBe(500); // 進行中のアップロードがあるため完了にしない
    expect(count(h, 'user', `id = '${idA}'`)).toBe(1);
    expect(count(h, 'account_deletions', `user_id = '${idA}' AND completed_at IS NOT NULL`)).toBe(0);

    g.open(); // 止まっていたR2書き込みが再開
    expect((await pending).status).toBe(401);
    h.faults.beforePut = null;
    expect(userObjects(h, idA)).toEqual([]); // 書き込み側が自分で取り消した
    expect(count(h, 'image_uploads', `user_id = '${idA}'`)).toBe(0);

    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    expect(count(h, 'account_deletions', `user_id = '${idA}' AND completed_at IS NOT NULL`)).toBe(1);
    expect(userObjects(h, idA)).toEqual([]);
    expect(userObjects(h, idB).length).toBe(1);
  });

  test('失効したアップロード記録があっても削除は完了でき、遅れた書き込みも回収される', async () => {
    const { h, a, idA } = await setup();
    const g = gate();
    h.faults.beforePut = g.promise;
    const pending = upload(h, a, 'late.png', png(9));
    await tick();
    h.sqlite.run('UPDATE image_uploads SET started_at = 0 WHERE user_id = ?', [idA]); // 失効扱い

    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    g.open(); // 削除完了後に遅れて書き込まれる
    const res = await pending;
    h.faults.beforePut = null;
    expect(res.status).toBe(401);
    expect(userObjects(h, idA)).toEqual([]);
  });

  test('取り消しにも失敗した残骸は、記録が失効した後の定期掃除で回収される', async () => {
    const { h, a, idA } = await setup();
    const g = gate();
    h.faults.beforePut = g.promise;
    const pending = upload(h, a, 'stuck.png', png(10));
    await tick();
    h.sqlite.run('UPDATE image_uploads SET started_at = 1000 WHERE user_id = ?', [idA]);
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);

    // 書き込みは再開されたが、取り消し(delete)も失敗する
    const orig = h.objects.delete.bind(h.objects);
    h.objects.delete = () => {
      throw new Error('R2 unavailable');
    };
    g.open();
    await pending;
    h.objects.delete = orig;
    h.faults.beforePut = null;
    expect(userObjects(h, idA).length).toBe(1);

    // 取り消しの失敗は永続的な掃除タスクとして記録される(削除が完了済みでも、手動の復旧操作は不要)
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(1);
    expect(count(h, 'account_deletions', `user_id = '${idA}' AND completed_at IS NOT NULL`)).toBe(1);

    // 定期掃除: R2がまだ失敗する間はタスクが残り、回復後に消える。他アカウントの画像は消えない
    const drv = bunDriver(h.sqlite);
    const failing = memoryStore(h.objects);
    failing.delete = async () => {
      throw new Error('R2 unavailable');
    };
    expect(await sweepCleanupTasks(drv, failing)).toBe(0);
    expect(count(h, 'r2_cleanup_tasks')).toBe(1);
    const idB = (h.sqlite.query('SELECT id FROM user WHERE email = ?').get('b@example.com') as { id: string }).id;
    expect(await sweepCleanupTasks(drv, memoryStore(h.objects))).toBe(0); // R2は消えるが、保証期間中はタスクを残す
    expect(userObjects(h, idA)).toEqual([]);
    expect(count(h, 'r2_cleanup_tasks')).toBe(1);
    expect(await sweepCleanupTasks(drv, memoryStore(h.objects), afterGuarantee())).toBe(1);
    expect(await sweepCleanupTasks(drv, memoryStore(h.objects), afterGuarantee())).toBe(0); // 冪等
    expect(userObjects(h, idA)).toEqual([]);
    expect(userObjects(h, idB).length).toBe(1);
    expect(count(h, 'r2_cleanup_tasks')).toBe(0);
  });

  test('削除完了後の遅延PUTでD1の削除依頼確認が失敗しても、書き込み先は追跡され復旧後に回収される', async () => {
    const { h, a, idA, idB } = await setup();
    const g = gate();
    h.faults.beforePut = g.promise;
    const pendings = [31, 32].map((n) => upload(h, a, `d${n}.png`, png(n))); // 並行アップロード
    await tick();
    // 書き込み前に、書き込み先が永続タスクとして記録されている
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(2);
    h.sqlite.run('UPDATE image_uploads SET started_at = 0'); // 失効扱い
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(2); // 削除完了後もタスクは残る

    h.faults.readDeletion = true; // D1の読み取り障害
    g.open();
    const results = await Promise.all(pendings);
    h.faults.readDeletion = false;
    h.faults.beforePut = null;
    expect(results.map((r) => r.status)).toEqual([500, 500]); // 握りつぶさず失敗を返す
    expect(userObjects(h, idA).length).toBe(2); // R2には書かれている
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(2); // 追跡情報は失われていない

    // D1復旧後の定期掃除で回収される。他アカウントの画像は残る。再実行しても結果は同じ
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects))).toBe(0);
    expect(userObjects(h, idA)).toEqual([]);
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(2); // 保証期間中はタスクを残す
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects), afterGuarantee())).toBe(2);
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects), afterGuarantee())).toBe(0);
    expect(userObjects(h, idB).length).toBe(1);
    expect(count(h, 'r2_cleanup_tasks')).toBe(0);
  });

  test('リース失効後の掃除でもタスクは消えず、停止していたPUTが後から着地しても回収される(D1読み取り障害つき)', async () => {
    const { h, a, idA, idB } = await setup();
    const g = gate();
    h.faults.beforePut = g.promise;
    const pending = upload(h, a, 'zombie.png', png(50));
    await tick();
    h.sqlite.run('UPDATE image_uploads SET started_at = 0'); // lease 失効
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    // 掃除が先に走る。PUT は未完了かもしれないのでタスクは消さない
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects))).toBe(0);
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(1);

    h.faults.readDeletion = true;
    g.open(); // 停止していたPUTが再開して書き込む
    expect((await pending).status).toBe(500);
    h.faults.readDeletion = false;
    h.faults.beforePut = null;
    expect(userObjects(h, idA).length).toBe(1);

    // D1復旧後の次回の掃除(Workers 再起動相当)でR2から消える。他アカウントは残る
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects))).toBe(0);
    expect(userObjects(h, idA)).toEqual([]);
    expect(userObjects(h, idB).length).toBe(1);
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects), afterGuarantee())).toBe(1);
    expect(count(h, 'r2_cleanup_tasks')).toBe(0);
  });

  test('掃除タスクを記録できない(D1障害)ときはR2へ何も書かない', async () => {
    const { h, a, idA } = await setup();
    h.faults.failBatchOn = 'INSERT INTO r2_cleanup_tasks';
    const res = await upload(h, a, 'nowrite.png', png(40));
    h.faults.failBatchOn = null;
    expect(res.status).toBe(500);
    expect(userObjects(h, idA).length).toBe(1); // setup の a1.png のみ
    expect(count(h, 'image_uploads', `user_id = '${idA}'`)).toBe(0);
  });

  test('R2削除失敗とD1の記録削除失敗が重なっても、タスクが残り定期掃除で回収される', async () => {
    const { h, a, idA } = await setup();
    const g = gate();
    h.faults.beforePut = g.promise;
    const pending = upload(h, a, 'both.png', png(41));
    await tick();
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(500); // アップロード中は完了しない
    const orig = h.objects.delete.bind(h.objects);
    h.objects.delete = () => {
      throw new Error('R2 unavailable');
    };
    g.open();
    expect((await pending).status).toBe(401);
    h.objects.delete = orig;
    h.faults.beforePut = null;
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(1);
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects), afterGuarantee())).toBe(1);
    expect(count(h, 'r2_cleanup_tasks')).toBe(0);
  });

  test('正常に完了したアップロードの掃除タスクは残らない。削除依頼の無い古いタスクは行だけ捨てる', async () => {
    const { h, idA, idB } = await setup();
    expect(count(h, 'r2_cleanup_tasks')).toBe(0);
    h.sqlite.run('INSERT INTO r2_cleanup_tasks (id, r2_key, user_id, created_at) VALUES (?, ?, ?, ?)', [
      'stale',
      `u/${idB}/x`,
      idB,
      1,
    ]);
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects), 10 * 24 * 3600 * 1000)).toBe(0);
    expect(count(h, 'r2_cleanup_tasks')).toBe(0);
    expect(userObjects(h, idA).length).toBe(1);
    expect(userObjects(h, idB).length).toBe(1);
  });

  test('複数の失効アップロードが削除完了後に再開しても、すべて回収される', async () => {
    const { h, a, b, idA, idB } = await setup();
    const g = gate();
    h.faults.beforePut = g.promise;
    const pendings = [11, 12, 13].map((n) => upload(h, a, `m${n}.png`, png(n)));
    const other = upload(h, b, 'bm.png', png(20)); // 他アカウントも同時に書き込み中
    await tick();
    h.sqlite.run('UPDATE image_uploads SET started_at = 0'); // すべて失効扱い
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);

    const orig = h.objects.delete.bind(h.objects);
    h.objects.delete = () => {
      throw new Error('R2 unavailable');
    };
    g.open();
    const results = await Promise.all(pendings);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401]);
    expect((await other).status).toBe(200); // 他アカウントは影響を受けない
    h.objects.delete = orig;
    h.faults.beforePut = null;
    expect(userObjects(h, idA).length).toBe(3);
    expect(count(h, 'r2_cleanup_tasks', `user_id = '${idA}'`)).toBe(3);

    // Workers 再起動相当: 新しいドライバ・ストアで掃除しても同じ結果になる
    expect(await sweepCleanupTasks(bunDriver(h.sqlite), memoryStore(h.objects), afterGuarantee())).toBe(3);
    expect(userObjects(h, idA)).toEqual([]);
    expect(userObjects(h, idB).length).toBe(2);
    expect(count(h, 'r2_cleanup_tasks')).toBe(0);
  });

  test('他アカウントの画像アップロードは影響を受けない', async () => {
    const { h, a, b } = await setup();
    h.faults.deletePrefix = true;
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(500);
    h.faults.deletePrefix = false;
    expect((await upload(h, b, 'b2.png', png(11))).status).toBe(200);
  });
});

describe('削除が途中で止まったアカウントの再試行', () => {
  test('状態確認と再試行だけが使え、通常のAPIは拒否されたまま', async () => {
    const { h, a, idA } = await setup();
    h.faults.deletePrefix = true;
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(500);

    // アプリ再起動後を想定: 同じCookieで状態を取得できる
    const info = await h.request('/v1/account', { headers: { cookie: a } });
    expect(info.status).toBe(200);
    const body = (await info.json()) as any;
    expect(body.deletionPending).toBe(true);
    expect(body.providers).toEqual(['credential']);

    expect((await h.request('/v1/sync/pull?cursor=0', { headers: { cookie: a } })).status).toBe(401);
    expect((await h.raw('/v1/images/a1.png', { method: 'GET', cookie: a })).status).toBe(401);
    expect((await h.request('/v1/me', { headers: { cookie: a } })).status).toBe(401);

    // 再試行にも本人確認が要る
    expect((await remove(h, a, { confirm: true })).status).toBe(403);
    h.faults.deletePrefix = false;
    expect((await remove(h, a, { confirm: true, password: PASSWORD })).status).toBe(200);
    expect(count(h, 'user', `id = '${idA}'`)).toBe(0);
  });

  test('通常のアカウントは deletionPending=false', async () => {
    const { h, a } = await setup();
    const body = (await (await h.request('/v1/account', { headers: { cookie: a } })).json()) as any;
    expect(body.deletionPending).toBe(false);
  });
});
