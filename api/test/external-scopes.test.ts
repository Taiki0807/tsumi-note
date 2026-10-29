import { describe, expect, test } from 'bun:test';
import { createHarness, registerAndLogin } from './harness';

type H = ReturnType<typeof createHarness>;

const iso = (ms: number) => new Date(ms).toISOString();

async function setup() {
  const h = createHarness();
  const a = await registerAndLogin(h, 'a@example.com');
  const b = await registerAndLogin(h, 'b@example.com');
  return { h, a, b };
}

async function createToken(h: H, cookie: string, body: Record<string, unknown> = {}) {
  const res = await h.request('/v1/api-tokens', { body: { name: 'キー', ...body }, headers: { cookie } });
  return { status: res.status, body: (await res.json()) as any };
}

async function post(h: H, token: string | undefined, body: unknown) {
  const res = await h.request('/external/v1/study-sessions', {
    body,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function get(h: H, token: string | undefined, path: string) {
  const res = await h.request(path, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function pull(h: H, cookie: string) {
  const res = await h.request('/v1/sync/pull?cursor=0', { headers: { cookie } });
  return ((await res.json()) as any).changes as { entity: string; id: string; data: any }[];
}

const session = (over: Record<string, unknown> = {}) => {
  const end = Date.now() - 60_000;
  return { externalId: 'drill-1', startedAt: iso(end - 30 * 60_000), endedAt: iso(end), ...over };
};

const at = (minutesAgo: number, length = 30, externalId = `e${minutesAgo}`) => {
  const end = Date.now() - minutesAgo * 60_000;
  return { externalId, startedAt: iso(end - length * 60_000), endedAt: iso(end) };
};

const BOTH = { scopes: ['study_sessions:read', 'study_sessions:write'] };

describe('権限(scopes)と有効期限', () => {
  test('scopes を省略した発行は登録専用で、読み取りは 403', async () => {
    const { h, a } = await setup();
    const t = await createToken(h, a);
    expect(t.body.scopes).toEqual(['study_sessions:write']);
    expect(t.body.expiresAt).toBeNull();
    const res = await get(h, t.body.token, '/external/v1/study-sessions');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
    expect((await get(h, t.body.token, '/external/v1/study-summary')).status).toBe(403);
  });

  test('読み取り専用のキーは登録できない', async () => {
    const { h, a } = await setup();
    const t = await createToken(h, a, { scopes: ['study_sessions:read'] });
    expect(t.status).toBe(201);
    const res = await post(h, t.body.token, session());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('insufficient_scope');
    expect((await pull(h, a)).filter((c) => c.entity === 'study_sessions')).toHaveLength(0);
  });

  test('scopes と expiresInDays の検証', async () => {
    const { h, a } = await setup();
    for (const scopes of [[], ['admin'], 'study_sessions:read', [1]]) {
      expect((await createToken(h, a, { scopes })).status).toBe(400);
    }
    for (const expiresInDays of [0, -1, 366, 1.5, '90']) {
      expect((await createToken(h, a, { expiresInDays })).status).toBe(400);
    }
    const ok = await createToken(h, a, { expiresInDays: 90, ...BOTH });
    expect(ok.status).toBe(201);
    expect(ok.body.scopes).toEqual(['study_sessions:write', 'study_sessions:read']);
    expect(ok.body.expiresAt - Date.now()).toBeGreaterThan(89 * 86_400_000);
    const list = (await (await h.request('/v1/api-tokens', { headers: { cookie: a } })).json()) as any;
    expect(list.tokens[0]).toMatchObject({ scopes: ['study_sessions:write', 'study_sessions:read'] });
  });

  test('期限切れのキーは 401 になり、一覧には残る(失効して整理できる)', async () => {
    const { h, a } = await setup();
    const t = await createToken(h, a, { expiresInDays: 1 });
    expect((await post(h, t.body.token, session())).status).toBe(201);
    h.sqlite.query('UPDATE api_tokens SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, t.body.id);
    expect((await post(h, t.body.token, session({ externalId: 'again' }))).status).toBe(401);
    const list = (await (await h.request('/v1/api-tokens', { headers: { cookie: a } })).json()) as any;
    expect(list.tokens).toHaveLength(1);
  });

  test('列追加前の既存トークン(列の既定値のまま)は従来どおり登録だけできる', async () => {
    const { h, a } = await setup();
    const t = await createToken(h, a);
    // 0007 適用前に発行された行と同じ状態(scopes は DEFAULT、expires_at は NULL)
    h.sqlite.query("UPDATE api_tokens SET scopes = 'study_sessions:write', expires_at = NULL").run();
    expect((await post(h, t.body.token, session())).status).toBe(201);
    expect((await get(h, t.body.token, '/external/v1/study-sessions')).status).toBe(403);
  });
});

describe('GET /external/v1/study-sessions・study-summary', () => {
  test('登録した記録を新しい順に取得でき、ページングできる', async () => {
    const { h, a } = await setup();
    const t = (await createToken(h, a, BOTH)).body.token as string;
    for (const m of [600, 300, 100]) expect((await post(h, t, at(m))).status).toBe(201);
    const all = await get(h, t, '/external/v1/study-sessions');
    expect(all.status).toBe(200);
    expect(all.body.sessions).toHaveLength(3);
    expect(all.body.sessions[0].startedAt > all.body.sessions[1].startedAt).toBe(true);
    expect(all.body.nextCursor).toBeNull();

    const p1 = await get(h, t, '/external/v1/study-sessions?limit=2');
    expect(p1.body.sessions).toHaveLength(2);
    expect(p1.body.nextCursor).not.toBeNull();
    const cursor = encodeURIComponent(p1.body.nextCursor);
    const p2 = await get(h, t, `/external/v1/study-sessions?limit=2&cursor=${cursor}`);
    expect(p2.body.sessions).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
    expect([...p1.body.sessions, ...p2.body.sessions].map((s: any) => s.id)).toEqual(
      all.body.sessions.map((s: any) => s.id),
    );
  });

  test('他人の学習記録は取得できない', async () => {
    const { h, a, b } = await setup();
    const ta = (await createToken(h, a, BOTH)).body.token as string;
    const tb = (await createToken(h, b, BOTH)).body.token as string;
    await post(h, ta, at(60, 30, 'mine'));
    await post(h, tb, at(30, 45, 'theirs'));
    const mine = await get(h, ta, '/external/v1/study-sessions');
    expect(mine.body.sessions).toHaveLength(1);
    expect(mine.body.sessions[0].durationSeconds).toBe(1800);
    const theirs = await get(h, tb, '/external/v1/study-summary');
    expect(theirs.body.totalSeconds).toBe(45 * 60);
  });

  test('認証なし・不正トークンは 401、失効後は読めない', async () => {
    const { h, a } = await setup();
    const t = await createToken(h, a, BOTH);
    expect((await get(h, undefined, '/external/v1/study-sessions')).status).toBe(401);
    expect((await get(h, 'tsn_' + 'a'.repeat(43), '/external/v1/study-summary')).status).toBe(401);
    await h.app.request(`${h.baseURL}/v1/api-tokens/${t.body.id}`, {
      method: 'DELETE',
      headers: { cookie: a, 'cf-connecting-ip': '10.7.7.7' },
    });
    expect((await get(h, t.body.token, '/external/v1/study-sessions')).status).toBe(401);
  });

  test('クエリの検証', async () => {
    const { h, a } = await setup();
    const t = (await createToken(h, a, BOTH)).body.token as string;
    const reversed = `from=${encodeURIComponent(iso(Date.now()))}&to=${encodeURIComponent(iso(Date.now() - 1000))}`;
    for (const q of ['limit=0', 'limit=101', 'limit=x', 'cursor=bad', 'from=2026-10-01', reversed]) {
      expect((await get(h, t, `/external/v1/study-sessions?${q}`)).status).toBe(400);
    }
    expect((await get(h, t, '/external/v1/study-summary?utcOffsetMinutes=99999')).status).toBe(400);
    const wide = `from=${encodeURIComponent(iso(Date.now() - 200 * 86_400_000))}`;
    expect((await get(h, t, `/external/v1/study-summary?${wide}`)).status).toBe(400);
  });

  test('study-summary は日別・フォルダー別に集計する', async () => {
    const { h, a } = await setup();
    await h.request('/v1/sync/push', {
      headers: { cookie: a },
      body: {
        changes: [
          {
            entity: 'folders',
            id: 'folder-a',
            opId: 'op-folder-a',
            baseSeq: null,
            data: { name: '韓国語', created_at: 1, updated_at: 1, deleted_at: null },
          },
        ],
      },
    });
    const t = (await createToken(h, a, BOTH)).body.token as string;
    await post(h, t, { ...at(120, 30, 'x1'), folderId: 'folder-a' });
    await post(h, t, at(60, 20, 'x2'));
    const s = await get(h, t, '/external/v1/study-summary');
    expect(s.status).toBe(200);
    expect(s.body.totalSeconds).toBe(50 * 60);
    expect(s.body.sessionCount).toBe(2);
    expect(s.body.folders).toEqual(
      expect.arrayContaining([
        { folderId: 'folder-a', totalSeconds: 1800 },
        { folderId: null, totalSeconds: 1200 },
      ]),
    );
    expect(s.body.days.reduce((n: number, d: any) => n + d.totalSeconds, 0)).toBe(50 * 60);
  });

  test('読み取りもトークン単位のレート制限を受ける', async () => {
    const { h, a } = await setup();
    const t = (await createToken(h, a, BOTH)).body.token as string;
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await get(h, t, '/external/v1/study-sessions')).status;
    expect(last).toBe(429);
  });
});
