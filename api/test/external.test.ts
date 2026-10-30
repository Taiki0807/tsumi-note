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
