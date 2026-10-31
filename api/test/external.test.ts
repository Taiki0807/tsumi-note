import { describe, expect, test } from 'bun:test';
import { createHarness, registerAndLogin } from './harness';

type H = ReturnType<typeof createHarness>;

const iso = (ms: number) => new Date(ms).toISOString();

async function createToken(h: H, cookie: string, name = 'ドリルアプリ') {
  const res = await h.request('/v1/api-tokens', { body: { name }, headers: { cookie } });
  return { status: res.status, body: (await res.json()) as any };
}

async function post(h: H, token: string | undefined, body: unknown, ip?: string) {
  const res = await h.request('/external/v1/study-sessions', {
    body,
    ip,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function pull(h: H, cookie: string) {
  const res = await h.request('/v1/sync/pull?cursor=0', { headers: { cookie } });
  return ((await res.json()) as any).changes as { entity: string; id: string; data: any }[];
}

async function setup() {
  const h = createHarness();
  const a = await registerAndLogin(h, 'a@example.com');
  const b = await registerAndLogin(h, 'b@example.com');
  return { h, a, b };
}

const session = (over: Record<string, unknown> = {}) => {
  const end = Date.now() - 60_000;
  return { externalId: 'drill-1', startedAt: iso(end - 30 * 60_000), endedAt: iso(end), ...over };
};

describe('APIトークン管理', () => {
  test('ログイン中のセッションだけが発行でき、平文は発行時にしか返らない', async () => {
    const { h, a } = await setup();
    expect((await h.request('/v1/api-tokens', { body: { name: 'x' } })).status).toBe(401);

    const created = await createToken(h, a);
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^tsn_[A-Za-z0-9_-]{43}$/);

    const list = (await (await h.request('/v1/api-tokens', { headers: { cookie: a } })).json()) as any;
    expect(list.tokens).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.body.token);
    // DBにもハッシュしか残らない
    const rows = h.sqlite.query('SELECT token_hash FROM api_tokens').all() as { token_hash: string }[];
    expect(rows[0]!.token_hash).not.toContain(created.body.token);
  });

  test('名前は必須、個数に上限がある', async () => {
    const { h, a } = await setup();
    expect((await createToken(h, a, '')).status).toBe(400);
    for (let i = 0; i < 5; i++) expect((await createToken(h, a, `t${i}`)).status).toBe(201);
    expect((await createToken(h, a, 'あふれ')).status).toBe(409);
  });

  test('他人のトークンは失効できず、トークン自身では管理APIを使えない', async () => {
    const { h, a, b } = await setup();
    const t = await createToken(h, a);
    expect(
      (await h.request('/v1/api-tokens', { headers: { authorization: `Bearer ${t.body.token}` } })).status,
    ).toBe(401);
    const del = (cookie: string) =>
      h.app.request(`${h.baseURL}/v1/api-tokens/${t.body.id}`, {
        method: 'DELETE',
        headers: { cookie, 'cf-connecting-ip': '10.9.9.9' },
      });
    expect((await del(b)).status).toBe(404);
    expect((await del(a)).status).toBe(200);
    expect((await post(h, t.body.token, session())).status).toBe(401);
  });
});

describe('POST /external/v1/study-sessions', () => {
  test('トークンの持ち主の同期データとして学習記録が登録され、アプリが取得できる', async () => {
    const { h, a, b } = await setup();
    const t = await createToken(h, a);
    const input = session();
    const res = await post(h, t.body.token, input);
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);

    const mine = (await pull(h, a)).filter((c) => c.entity === 'study_sessions');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.data).toMatchObject({
      folder_id: null,
      started_at: Math.floor(Date.parse(input.startedAt) / 1000) * 1000,
      duration_seconds: 30 * 60,
    });
    // 他のユーザーには見えない
    expect((await pull(h, b)).filter((c) => c.entity === 'study_sessions')).toHaveLength(0);
  });

  test('同じ externalId の再送は重複しない(冪等)', async () => {
    const { h, a } = await setup();
    const t = await createToken(h, a);
    const input = session();
    expect((await post(h, t.body.token, input)).status).toBe(201);
    const again = await post(h, t.body.token, input);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect((await pull(h, a)).filter((c) => c.entity === 'study_sessions')).toHaveLength(1);
  });

  test('認証: トークンなし・不正・セッションCookieだけでは拒否される', async () => {
    const { h, a } = await setup();
    expect((await post(h, undefined, session())).status).toBe(401);
    expect((await post(h, 'tsn_' + 'a'.repeat(43), session())).status).toBe(401);
    const res = await h.request('/external/v1/study-sessions', { body: session(), headers: { cookie: a } });
    expect(res.status).toBe(401);
  });

  test('入力検証', async () => {
    const { h, a } = await setup();
    const t = (await createToken(h, a)).body.token as string;
    const now = Date.now();
    const bad = async (over: Record<string, unknown>) => (await post(h, t, session(over))).status;
    expect(await bad({ externalId: '' })).toBe(400);
    expect(await bad({ externalId: 'a b' })).toBe(400);
    expect(await bad({ startedAt: '2026-10-28 09:00' })).toBe(400); // タイムゾーンなし
    expect(await bad({ startedAt: iso(now - 60_000), endedAt: iso(now - 120_000) })).toBe(400);
    expect(await bad({ startedAt: iso(now + 3_600_000), endedAt: iso(now + 7_200_000) })).toBe(400); // 未来
    expect(await bad({ startedAt: iso(now - 30 * 3_600_000), endedAt: iso(now - 60_000) })).toBe(400); // 24h超
    expect(await bad({ durationSeconds: 999_999 })).toBe(400);
    expect(await bad({ durationSeconds: 0 })).toBe(400);
    expect(await bad({ userId: 'someone' })).toBe(400); // 未知のキー(ユーザーIDは受け取らない)
    expect(await bad({ durationSeconds: 600 })).toBe(201);
  });

  test('フォルダーは自分のものだけ指定できる', async () => {
    const { h, a, b } = await setup();
    const folder = (cookie: string, id: string) =>
      h.request('/v1/sync/push', {
        headers: { cookie },
        body: {
          changes: [
            {
              entity: 'folders',
              id,
              opId: `op-${id}`,
              baseSeq: null,
              data: { name: '韓国語', created_at: 1, updated_at: 1, deleted_at: null },
            },
          ],
        },
      });
    await folder(a, 'folder-a');
    await folder(b, 'folder-b');
    const t = (await createToken(h, a)).body.token as string;
    expect((await post(h, t, session({ folderId: 'folder-b' }))).status).toBe(422);
    expect((await post(h, t, session({ folderId: 'nope' }))).status).toBe(422);
    const ok = await post(h, t, session({ folderId: 'folder-a' }));
    expect(ok.status).toBe(201);
    const rec = (await pull(h, a)).find((c) => c.entity === 'study_sessions');
    expect(rec!.data.folder_id).toBe('folder-a');
  });

  describe('folderName', () => {
    const pushFolder = (h: H, cookie: string, id: string, name: string, over: Record<string, unknown> = {}) =>
      h.request('/v1/sync/push', {
        headers: { cookie },
        body: {
          changes: [
            {
              entity: 'folders',
              id,
              opId: `op-${id}`,
              baseSeq: null,
              data: { name, created_at: 1, updated_at: 1, deleted_at: null, ...over },
            },
          ],
        },
      });
    const folders = async (h: H, cookie: string) =>
      (await pull(h, cookie)).filter((c) => c.entity === 'folders' && c.data.deleted_at === null);
    const tokenOf = async (h: H, cookie: string) => (await createToken(h, cookie)).body.token as string;

    test('同名フォルダーがあればそこへ記録する(前後の空白・濁点の分解形も一致)', async () => {
      const { h, a } = await setup();
      await pushFolder(h, a, 'f1', 'ダンス'); // NFC
      const t = await tokenOf(h, a);
      const decomposed = `  ${'ダンス'.normalize('NFD')}  `;
      const res = await post(h, t, session({ folderName: decomposed }));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ folderId: 'f1', folderCreated: false });
      expect(await folders(h, a)).toHaveLength(1);
    });

    test('同名が複数なら created_at が最も古いもの。大文字小文字は区別する', async () => {
      const { h, a } = await setup();
      await pushFolder(h, a, 'new', 'Math', { created_at: 20 });
      await pushFolder(h, a, 'old', 'Math', { created_at: 10 });
      await pushFolder(h, a, 'lower', 'math', { created_at: 1 });
      const t = await tokenOf(h, a);
      expect((await post(h, t, session({ folderName: 'Math' }))).body.folderId).toBe('old');
    });

    test('なければ作成され、同期で フォルダー と 記録 の両方が取得できる', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      const res = await post(h, t, session({ folderName: '韓国語' }));
      expect(res.status).toBe(201);
      expect(res.body.folderCreated).toBe(true);
      expect(res.body.folderId).toMatch(/^extf-[0-9a-f]{40}$/);
      const changes = await pull(h, a);
      expect(changes.find((c) => c.entity === 'folders')!.data.name).toBe('韓国語');
      expect(changes.find((c) => c.entity === 'study_sessions')!.data.folder_id).toBe(res.body.folderId);
    });

    test('同じ新しい名前を並行・連続で登録してもフォルダーは1つ', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      const rs = await Promise.all([
        post(h, t, session({ externalId: 'p1', folderName: '新規' })),
        post(h, t, session({ externalId: 'p2', folderName: '新規' })),
      ]);
      expect(rs.every((r) => r.status === 201)).toBe(true);
      const r3 = await post(h, t, session({ externalId: 'p3', folderName: '新規' }));
      expect(r3.body.folderCreated).toBe(false);
      expect(await folders(h, a)).toHaveLength(1);
    });

    test('異なる externalId・同じ新規名の並行登録は両方 201、フォルダー1つ、作成扱いは片方だけ', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      const rs = await Promise.all([
        post(h, t, session({ externalId: 'q1', folderName: '並行' })),
        post(h, t, session({ externalId: 'q2', folderName: '並行' })),
      ]);
      expect(rs.map((r) => r.status)).toEqual([201, 201]);
      expect(rs.filter((r) => r.body.folderCreated).length).toBe(1);
      const fs = await folders(h, a);
      expect(fs).toHaveLength(1);
      const sessions = (await pull(h, a)).filter((c) => c.entity === 'study_sessions');
      expect(sessions).toHaveLength(2);
      for (const s of sessions) expect(s.data.folder_id).toBe(fs[0]!.id);
    });

    test('フォルダー書き込みが retry になっても 500 にならず、並行作成済みのフォルダーを使う', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      let injected = false;
      h.faults.beforeBatch = async (statements, inner) => {
        if (injected || !statements.some((s) => s.params.some((p) => typeof p === 'string' && p.startsWith('extf-')))) {
          return;
        }
        injected = true;
        await inner.batch(statements); // 並行リクエストが先に同じフォルダーを作成した状況
      };
      const res = await post(h, t, session({ folderName: '競合' }));
      expect(injected).toBe(true);
      expect(res.status).toBe(201);
      expect(res.body.folderCreated).toBe(false);
      const fs = await folders(h, a);
      expect(fs).toHaveLength(1);
      expect(res.body.folderId).toBe(fs[0]!.id);
      const rec = (await pull(h, a)).find((c) => c.entity === 'study_sessions');
      expect(rec!.data.folder_id).toBe(fs[0]!.id);
    });

    test('決定的IDのフォルダーが削除済みならランダムIDで作成される', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      const first = await post(h, t, session({ externalId: 'd1', folderName: '削除' }));
      h.sqlite.run('UPDATE sync_records SET deleted_at = 5 WHERE id = ?', [first.body.folderId]);
      const second = await post(h, t, session({ externalId: 'd2', folderName: '削除' }));
      expect(second.status).toBe(201);
      expect(second.body.folderCreated).toBe(true);
      expect(second.body.folderId).not.toBe(first.body.folderId);
      expect(second.body.folderId).not.toMatch(/^extf-/);
    });

    test('学習記録の書き込みが retry でも、既に保存されていれば duplicate: true で成功する', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      let injected = false;
      h.faults.beforeBatch = async (statements, inner) => {
        if (injected || !statements.some((s) => s.params.some((p) => typeof p === 'string' && p.startsWith('ext-')))) {
          return;
        }
        injected = true;
        await inner.batch(statements); // 同じ記録が並行リクエストで先に保存された状況
      };
      const res = await post(h, t, session({ externalId: 's1', folderName: '記録競合' }));
      expect(injected).toBe(true);
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
      expect((await pull(h, a)).filter((c) => c.entity === 'study_sessions')).toHaveLength(1);
    });

    test('削除済み・他ユーザーの同名フォルダーは使わない', async () => {
      const { h, a, b } = await setup();
      await pushFolder(h, a, 'gone', '英語', { deleted_at: 5 });
      await pushFolder(h, b, 'theirs', '英語');
      const t = await tokenOf(h, a);
      const res = await post(h, t, session({ folderName: '英語' }));
      expect(res.body.folderCreated).toBe(true);
      expect(res.body.folderId).not.toBe('gone');
      expect(res.body.folderId).not.toBe('theirs');
    });

    test('自動作成後に改名されたら、旧名では新しいフォルダーが作られる', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      const first = await post(h, t, session({ externalId: 'r1', folderName: '旧名' }));
      const cur = (await pull(h, a)).find((c) => c.entity === 'folders')! as any;
      const seq = ((await (await h.request('/v1/sync/pull?cursor=0', { headers: { cookie: a } })).json()) as any)
        .changes.find((c: any) => c.entity === 'folders').serverSeq;
      await h.request('/v1/sync/push', {
        headers: { cookie: a },
        body: {
          changes: [
            {
              entity: 'folders',
              id: first.body.folderId,
              opId: 'rename',
              baseSeq: seq,
              data: { ...cur.data, name: '新名', updated_at: cur.data.updated_at + 1 },
            },
          ],
        },
      });
      const second = await post(h, t, session({ externalId: 'r2', folderName: '旧名' }));
      expect(second.body.folderCreated).toBe(true);
      expect(second.body.folderId).not.toBe(first.body.folderId);
    });

    test('不正な指定は 400', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      const bad = async (over: Record<string, unknown>) => (await post(h, t, session(over))).status;
      expect(await bad({ folderId: 'x', folderName: 'y' })).toBe(400);
      expect(await bad({ folderName: 'a'.repeat(51) })).toBe(400);
      expect(await bad({ folderName: '' })).toBe(400);
      expect(await bad({ folderName: '   ' })).toBe(400);
      expect(await bad({ folderName: 5 })).toBe(400);
      expect(await bad({ folderName: 'a'.repeat(50) })).toBe(201);
    });

    test('同じ externalId の再送は duplicate: true でフォルダーを作らない', async () => {
      const { h, a } = await setup();
      const t = await tokenOf(h, a);
      expect((await post(h, t, session({ folderName: '一回' }))).status).toBe(201);
      const again = await post(h, t, session({ folderName: '別の名前' }));
      expect(again.status).toBe(200);
      expect(again.body.duplicate).toBe(true);
      expect(await folders(h, a)).toHaveLength(1);
    });
  });

  test('1分未満の記録は 400', async () => {
    const { h, a } = await setup();
    const t = (await createToken(h, a)).body.token as string;
    const end = Date.now() - 60_000;
    expect((await post(h, t, session({ startedAt: iso(end - 30_000), endedAt: iso(end) }))).status).toBe(400);
    expect((await post(h, t, session({ durationSeconds: 59 }))).status).toBe(400);
    expect((await post(h, t, session({ durationSeconds: 60 }))).status).toBe(201);
  });

  test('別ユーザーの同じ externalId は衝突しない', async () => {
    const { h, a, b } = await setup();
    const ta = (await createToken(h, a)).body.token as string;
    const tb = (await createToken(h, b)).body.token as string;
    expect((await post(h, ta, session())).status).toBe(201);
    expect((await post(h, tb, session())).status).toBe(201);
  });

  test('レート制限をかける', async () => {
    const { h, a } = await setup();
    const t = (await createToken(h, a)).body.token as string;
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await post(h, t, session({ externalId: `e${i}` }))).status;
    expect(last).toBe(429);
  });

  test('アカウント削除でトークンも消え、以後は使えない', async () => {
    const { h, a } = await setup();
    const t = (await createToken(h, a)).body.token as string;
    const res = await h.app.request(`${h.baseURL}/v1/account`, {
      method: 'DELETE',
      headers: { cookie: a, 'content-type': 'application/json', 'cf-connecting-ip': '10.8.8.8' },
      body: JSON.stringify({ confirm: true, password: 'study-note-2026' }),
    });
    expect(res.status).toBe(200);
    expect((await post(h, t, session())).status).toBe(401);
    expect(h.sqlite.query('SELECT COUNT(*) AS n FROM api_tokens').get()).toEqual({ n: 0 });
  });
});
