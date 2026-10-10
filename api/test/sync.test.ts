import { describe, expect, test } from 'bun:test';
import { ENTITIES as APP_ENTITIES } from '../../src/sync/entities';
import { ENTITIES } from '../src/sync/entities';
import { createHarness, registerAndLogin } from './harness';

type H = ReturnType<typeof createHarness>;
const HEADERS = (cookie: string) => ({ cookie });

const note = (over: Record<string, unknown> = {}) => ({
  folder_id: null,
  title: 'ノート',
  body: '本文',
  pinned: 0,
  created_at: 1000,
  updated_at: 1000,
  deleted_at: null,
  ...over,
});

let opCounter = 0;
const change = (
  entity: string,
  id: string,
  data: Record<string, unknown>,
  baseSeq: number | null = null,
  opId = `op-${++opCounter}`,
) => ({ entity, id, opId, baseSeq, data });

async function push(h: H, cookie: string, changes: unknown[]) {
  const res = await h.request('/v1/sync/push', { body: { changes }, headers: HEADERS(cookie) });
  return { status: res.status, body: (await res.json()) as any };
}

async function pull(h: H, cookie: string, cursor = 0, limit?: number) {
  const q = `cursor=${cursor}${limit ? `&limit=${limit}` : ''}`;
  const res = await h.request(`/v1/sync/pull?${q}`, { headers: HEADERS(cookie) });
  return { status: res.status, body: (await res.json()) as any };
}

async function setup() {
  const h = createHarness();
  const a = await registerAndLogin(h, 'a@example.com');
  const b = await registerAndLogin(h, 'b@example.com');
  return { h, a, b };
}

describe('アプリ側とAPI側のエンティティ定義', () => {
  test('同一である', () => {
    expect(JSON.stringify(APP_ENTITIES)).toBe(JSON.stringify(ENTITIES));
  });
});

describe('FSRS統合規則', () => {
  test('アプリ側とAPI側の判定が一致する', async () => {
    const { fsrsWins: appWins } = await import('../../src/sync/merge');
    const { fsrsWins: serverWins } = await import('../src/sync/service');
    const samples = [
      { last_review: null, reps: 0, updated_at: 1 },
      { last_review: 5, reps: 1, updated_at: 5 },
      { last_review: 5, reps: 2, updated_at: 4 },
      { last_review: 9, reps: 1, updated_at: 1 },
    ];
    for (const x of samples) for (const y of samples) expect(appWins(x, y)).toBe(serverWins(x, y));
  });
});

describe('認証・認可', () => {
  test('未認証は401', async () => {
    const { h } = await setup();
    expect((await h.request('/v1/sync/pull')).status).toBe(401);
    expect((await h.request('/v1/sync/push', { body: { changes: [] } })).status).toBe(401);
    expect(
      (await h.request('/v1/sync/pull', { headers: { cookie: 'better-auth.session_token=forged' } })).status,
    ).toBe(401);
  });

  test('アカウントAのデータはBから取得できず、Bの同名IDの書き込みはAに影響しない', async () => {
    const { h, a, b } = await setup();
    await push(h, a, [change('notes', 'n1', note({ title: 'Aのノート' }))]);
    expect((await pull(h, b)).body.changes).toEqual([]);

    await push(h, b, [change('notes', 'n1', note({ title: 'Bのノート' }))]);
    const pa = (await pull(h, a)).body;
    const pb = (await pull(h, b)).body;
    expect(pa.changes).toHaveLength(1);
    expect(pa.changes[0].data.title).toBe('Aのノート');
    expect(pb.changes[0].data.title).toBe('Bのノート');
    expect(pa.userId).not.toBe(pb.userId);
  });

  test('本文・クエリのユーザーIDは無視される(存在しないフィールドは拒否)', async () => {
    const { h, a, b } = await setup();
    const me = (await (await h.request('/v1/me', { headers: HEADERS(b) })).json()) as any;
    const res = await h.request('/v1/sync/push', {
      body: { userId: me.id, changes: [change('notes', 'x', note())] },
      headers: HEADERS(a),
    });
    expect(res.status).toBe(200);
    expect((await pull(h, b)).body.changes).toEqual([]);
    const q = await h.request(`/v1/sync/pull?userId=${me.id}`, { headers: HEADERS(a) });
    expect(((await q.json()) as any).userId).not.toBe(me.id);
  });
});

describe('入力検証と上限', () => {
  test('不正な入力は400で、何も保存されない', async () => {
    const { h, a } = await setup();
    const bad: unknown[] = [
      change('unknown', 'x', {}),
      change('notes', '../x', note()),
      change('notes', 'x', note({ extra: 1 })),
      change('notes', 'x', { ...note(), title: undefined }),
      change('notes', 'x', note({ pinned: 2 })),
      change('notes', 'x', note({ created_at: -1 })),
      change('notes', 'x', note({ title: 'a'.repeat(501) })),
      change('answer_history', 'x', { question_id: 'q', result: 'bogus', answered_at: 1, created_at: 1 }),
      change('settings', 'notification.reminderTime', { value: '1', updated_at: 1, deleted_at: null }),
      change('notes', 'x', note(), -5),
    ];
    for (const c of bad) expect((await push(h, a, [c])).status).toBe(400);
    expect((await push(h, a, [change('notes', 'ok', note()), change('notes', 'ok', note())])).status).toBe(
      400,
    );
    const tooMany = Array.from({ length: 101 }, (_, i) => change('notes', `n${i}`, note()));
    expect((await push(h, a, tooMany)).status).toBe(400);
    expect((await pull(h, a)).body.changes).toEqual([]);
    expect((await pull(h, a, -1)).status).toBe(400);
  });

  test('大きすぎる本文は413', async () => {
    const { h, a } = await setup();
    const res = await h.request('/v1/sync/push', {
      body: { changes: [], pad: 'x'.repeat(1_600_000) },
      headers: HEADERS(a),
    });
    expect(res.status).toBe(413);
  });

  test('SQLインジェクション文字列はデータとして扱われる', async () => {
    const { h, a } = await setup();
    const evil = "x'); DROP TABLE sync_records; --";
    const r = await push(h, a, [change('notes', 'inj', note({ title: evil, body: evil }))]);
    expect(r.status).toBe(200);
    expect((await pull(h, a)).body.changes[0].data.title).toBe(evil);
  });
});

describe('初回同期・差分', () => {
  test('初回アップロードと、2台目の全件ダウンロード', async () => {
    const { h, a } = await setup();
    const r = await push(h, a, [
      change('notes', 'n1', note()),
      change('folders', 'f1', { name: '数学', created_at: 1, updated_at: 1, deleted_at: null }),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(['applied', 'applied']);
    // 親(フォルダー)が先に採番される
    const p = (await pull(h, a)).body;
    expect(p.changes.map((c: any) => c.entity)).toEqual(['folders', 'notes']);
    expect(p.hasMore).toBe(false);
  });

  test('差分のみ取得でき、ページングできる', async () => {
    const { h, a } = await setup();
    await push(
      h,
      a,
      Array.from({ length: 5 }, (_, i) => change('notes', `n${i}`, note({ title: `t${i}` }))),
    );
    const p1 = (await pull(h, a, 0, 2)).body;
    expect(p1.changes).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    const p2 = (await pull(h, a, p1.nextCursor, 2)).body;
    const p3 = (await pull(h, a, p2.nextCursor, 2)).body;
    expect(p3.hasMore).toBe(false);
    const ids = [...p1.changes, ...p2.changes, ...p3.changes].map((c: any) => c.id);
    expect(new Set(ids).size).toBe(5);
    // 以降は差分のみ
    await push(h, a, [change('notes', 'n9', note())]);
    const d = (await pull(h, a, p3.nextCursor)).body;
    expect(d.changes.map((c: any) => c.id)).toEqual(['n9']);
    expect((await pull(h, a, d.nextCursor)).body.changes).toEqual([]);
  });
});

describe('冪等性', () => {
  test('同じ操作(opId)の再送は何も変えない', async () => {
    const { h, a } = await setup();
    const c = change('notes', 'n1', note());
    const first = await push(h, a, [c]);
    const again = await push(h, a, [c]);
    expect(again.body.results[0].status).toBe('applied');
    expect(again.body.results[0].serverSeq).toBe(first.body.results[0].serverSeq);
    expect((await pull(h, a)).body.changes).toHaveLength(1);
  });

  test('応答が失われた再送が、他端末の新しい更新を巻き戻さない', async () => {
    const { h, a } = await setup();
    const first = change('notes', 'n1', note({ title: '旧' }));
    const r1 = await push(h, a, [first]);
    const seq = r1.body.results[0].serverSeq;
    // 別端末が最新版を見て更新
    await push(h, a, [change('notes', 'n1', note({ title: '新', updated_at: 2000 }), seq)]);
    // 最初の端末が(応答を受け取れず)同じ操作を再送
    await push(h, a, [first]);
    const p = (await pull(h, a)).body.changes;
    expect(p).toHaveLength(1);
    expect(p[0].data.title).toBe('新');
  });

  test('履歴(追記専用)は同じIDを何度送っても1件', async () => {
    const { h, a } = await setup();
    const rh = {
      question_id: 'q1',
      rating: 'good',
      reviewed_at: 5,
      timed_out: 0,
      elapsed_ms: null,
      state: 0,
      due: 0,
      stability: 0,
      difficulty: 0,
      scheduled_days: 0,
      learning_steps: 0,
      created_at: 5,
    };
    await push(h, a, [change('review_history', 'r1', rh)]);
    await push(h, a, [change('review_history', 'r1', rh)]);
    await push(h, a, [change('review_history', 'r1', { ...rh, rating: 'easy' })]);
    const p = (await pull(h, a)).body.changes;
    expect(p).toHaveLength(1);
    expect(p[0].data.rating).toBe('good');
  });
});

describe('競合解決', () => {
  test('最新版を見た上での編集はそのまま採用(競合なし)', async () => {
    const { h, a } = await setup();
    const r1 = await push(h, a, [change('notes', 'n1', note())]);
    const r2 = await push(h, a, [
      change('notes', 'n1', note({ title: '更新', updated_at: 2 }), r1.body.results[0].serverSeq),
    ]);
    expect(r2.body.results[0]).toMatchObject({ status: 'applied', conflict: false });
    expect((await pull(h, a)).body.changes).toHaveLength(1);
  });

  test('同じノートを両端末で編集: 後着が採用され、先着は競合コピーとして残る', async () => {
    const { h, a } = await setup();
    const r0 = await push(h, a, [change('notes', 'n1', note({ title: '元' }))]);
    const base = r0.body.results[0].serverSeq;
    await push(h, a, [
      change('notes', 'n1', note({ title: 'iPhoneの編集', body: 'A', updated_at: 5 }), base),
    ]);
    const r = await push(h, a, [
      change('notes', 'n1', note({ title: 'iPadの編集', body: 'B', updated_at: 3 }), base),
    ]);
    expect(r.body.results[0]).toMatchObject({ status: 'applied', conflict: true });
    const all = (await pull(h, a)).body.changes;
    const main = all.find((c: any) => c.id === 'n1');
    const copy = all.find((c: any) => c.id !== 'n1');
    expect(main.data.title).toBe('iPadの編集');
    expect(copy.data.title).toBe('【競合コピー】iPhoneの編集');
    expect(copy.data.body).toBe('A');
    expect(copy.data.deleted_at).toBeNull();
  });

  test('競合コピーは再送しても増えない', async () => {
    const { h, a } = await setup();
    const r0 = await push(h, a, [change('notes', 'n1', note())]);
    const base = r0.body.results[0].serverSeq;
    await push(h, a, [change('notes', 'n1', note({ title: 'A', updated_at: 2 }), base)]);
    const c = change('notes', 'n1', note({ title: 'B', updated_at: 3 }), base);
    await push(h, a, [c]);
    await push(h, a, [c]);
    expect((await pull(h, a)).body.changes).toHaveLength(2);
  });

  test('問題の同時編集も競合コピーで保全される', async () => {
    const { h, a } = await setup();
    const q = (over = {}) => ({
      folder_id: 'f1',
      prompt: '問1',
      answer: '答',
      created_at: 1,
      updated_at: 1,
      deleted_at: null,
      ...over,
    });
    const r0 = await push(h, a, [change('questions', 'q1', q())]);
    const base = r0.body.results[0].serverSeq;
    await push(h, a, [change('questions', 'q1', q({ answer: 'A端末' }), base)]);
    await push(h, a, [change('questions', 'q1', q({ answer: 'B端末' }), base)]);
    const all = (await pull(h, a)).body.changes;
    expect(all.map((c: any) => c.data.answer).sort()).toEqual(['A端末', 'B端末']);
    expect(all.find((c: any) => c.id !== 'q1').data.prompt).toBe('【競合コピー】問1');
  });

  test('削除 vs 編集: 削除を採用し、他端末の編集内容は競合コピーとして残る', async () => {
    const { h, a } = await setup();
    const r0 = await push(h, a, [change('notes', 'n1', note())]);
    const base = r0.body.results[0].serverSeq;
    await push(h, a, [change('notes', 'n1', note({ body: '編集済み', updated_at: 5 }), base)]);
    const del = await push(h, a, [change('notes', 'n1', note({ deleted_at: 9, updated_at: 9 }), base)]);
    expect(del.body.results[0].conflict).toBe(true);
    const all = (await pull(h, a)).body.changes;
    expect(all.find((c: any) => c.id === 'n1').data.deleted_at).toBe(9);
    const copy = all.find((c: any) => c.id !== 'n1');
    expect(copy.data.body).toBe('編集済み');
    expect(copy.data.deleted_at).toBeNull();
  });

  test('編集 vs 削除(削除が先着): 削除済みは復活せず、編集内容は競合コピーとして残る', async () => {
    const { h, a } = await setup();
    const r0 = await push(h, a, [change('notes', 'n1', note())]);
    const base = r0.body.results[0].serverSeq;
    await push(h, a, [change('notes', 'n1', note({ deleted_at: 9, updated_at: 9 }), base)]);
    const edit = await push(h, a, [
      change('notes', 'n1', note({ body: '古い端末の編集', updated_at: 5 }), base),
    ]);
    expect(edit.body.results[0]).toMatchObject({ status: 'superseded', conflict: true });
    expect(edit.body.results[0].current.deleted_at).toBe(9);
    const all = (await pull(h, a)).body.changes;
    expect(all.find((c: any) => c.id === 'n1').data.deleted_at).toBe(9);
    expect(all.find((c: any) => c.id !== 'n1').data.body).toBe('古い端末の編集');
  });

  test('削除済みデータを古い端末が再アップロードしても復活しない(フォルダー)', async () => {
    const { h, a } = await setup();
    const f = (over = {}) => ({ name: '数学', created_at: 1, updated_at: 1, deleted_at: null, ...over });
    const r0 = await push(h, a, [change('folders', 'f1', f())]);
    const base = r0.body.results[0].serverSeq;
    await push(h, a, [change('folders', 'f1', f({ deleted_at: 9, updated_at: 9 }), base)]);
    const stale = await push(h, a, [change('folders', 'f1', f({ name: '古い名前' }), null)]);
    expect(stale.body.results[0].status).toBe('superseded');
    const rec = (await pull(h, a)).body.changes.find((c: any) => c.id === 'f1');
    expect(rec.data.deleted_at).toBe(9);
    expect(rec.data.name).toBe('数学');
  });

  test('削除の同期(tombstone)が他端末へ届く', async () => {
    const { h, a } = await setup();
    const r0 = await push(h, a, [change('notes', 'n1', note())]);
    const cursor = (await pull(h, a)).body.nextCursor;
    await push(h, a, [
      change('notes', 'n1', note({ deleted_at: 7, updated_at: 7 }), r0.body.results[0].serverSeq),
    ]);
    const d = (await pull(h, a, cursor)).body.changes;
    expect(d).toHaveLength(1);
    expect(d[0].data.deleted_at).toBe(7);
  });

  test('FSRS状態: 復習が新しい方が残り、順序によらず同じ結果になる', async () => {
    const { h, a } = await setup();
    const fs = (lastReview: number, reps: number) => ({
      due: 100,
      stability: 1,
      difficulty: 1,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps,
      lapses: 0,
      state: 2,
      last_review: lastReview,
      updated_at: lastReview,
    });
    await push(h, a, [change('fsrs_states', 'q1', fs(500, 3))]);
    const older = await push(h, a, [change('fsrs_states', 'q1', fs(400, 9))]);
    expect(older.body.results[0].status).toBe('superseded');
    expect(older.body.results[0].current.last_review).toBe(500);
    await push(h, a, [change('fsrs_states', 'q1', fs(600, 4))]);
    const rec = (await pull(h, a)).body.changes.find((c: any) => c.entity === 'fsrs_states');
    expect(rec.data.last_review).toBe(600);
  });

  test('同時に別リクエストが更新していたら retry(未送信のまま再送できる)', async () => {
    const { h, a } = await setup();
    const r0 = await push(h, a, [change('notes', 'n1', note())]);
    const base = r0.body.results[0].serverSeq;
    // 読み取り後・書き込み前に別の更新が入った状況を、サーバー側のseqを直接進めて再現
    const userRow = h.sqlite.query('SELECT user_id FROM sync_records LIMIT 1').get() as { user_id: string };
    const { pushChanges } = await import('../src/sync/service');
    const { bunDriver } = await import('./harness');
    const driver = bunDriver(h.sqlite);
    const racing = {
      ...driver,
      batch: async (s: any) => {
        h.sqlite.run('UPDATE sync_records SET server_seq = server_seq + 100 WHERE id = ?', ['n1']);
        return driver.batch(s);
      },
    };
    const { parsePush } = await import('../src/sync/validate');
    const { changes } = parsePush({ changes: [change('notes', 'n1', note({ title: '競合' }), base)] });
    const res = await pushChanges(racing, userRow.user_id, changes);
    expect(res[0]?.status).toBe('retry');
    const stored = h.sqlite.query("SELECT data FROM sync_records WHERE id = 'n1'").get() as { data: string };
    expect(JSON.parse(stored.data).title).toBe('ノート');
  });
});

describe('設定', () => {
  test('同期対象の設定だけ受け付け、端末固有の設定は拒否する', async () => {
    const { h, a } = await setup();
    const s = (value: string) => ({ value, updated_at: 1, deleted_at: null });
    expect((await push(h, a, [change('settings', 'review.sessionSize', s('20'))])).status).toBe(200);
    expect((await push(h, a, [change('settings', 'timer.state', s('{}'))])).status).toBe(400);
    expect((await push(h, a, [change('settings', 'notification.reminderEnabled', s('true'))])).status).toBe(
      400,
    );
  });
});
