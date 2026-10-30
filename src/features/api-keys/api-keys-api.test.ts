import { createApiKeysApi, describeApiKeyAccess, describeApiKeyUsage, maskedApiKey } from './api-keys-api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function api(respond: (url: string, init: RequestInit) => Response | Promise<Response>, cookie = 'c=1') {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createApiKeysApi({
    baseUrl: 'https://api.example.com',
    getCookie: () => cookie,
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond(url, init);
    }) as unknown as typeof fetch,
  });
  return { client, calls };
}

describe('api keys client', () => {
  it('lists keys with the session cookie and no user id', async () => {
    const { client, calls } = api(() =>
      json(200, { tokens: [{ id: 'k1', name: 'PC', prefix: 'tsn_abc123', createdAt: 1, lastUsedAt: null }] }),
    );
    const r = await client.list();
    expect(r).toEqual({
      ok: true,
      data: [{ id: 'k1', name: 'PC', prefix: 'tsn_abc123', createdAt: 1, lastUsedAt: null }],
    });
    expect(calls[0]?.url).toBe('https://api.example.com/v1/api-tokens');
    expect((calls[0]?.init.headers as Record<string, string>).cookie).toBe('c=1');
  });

  it('issues a key and returns the plaintext once', async () => {
    const { client, calls } = api(() =>
      json(201, {
        id: 'k2',
        name: 'ショートカット',
        prefix: 'tsn_zzzzzz',
        createdAt: 5,
        lastUsedAt: null,
        token: 'tsn_zzzzzzSECRET',
      }),
    );
    const r = await client.issue('ショートカット');
    expect(r.ok && r.data.token).toBe('tsn_zzzzzzSECRET');
    // 権限を指定しない発行は、従来どおり登録専用・無期限
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      name: 'ショートカット',
      scopes: ['study_sessions:write'],
      expiresInDays: null,
    });
  });

  it('sends the chosen scopes and expiry', async () => {
    const { client, calls } = api(() =>
      json(201, {
        id: 'k3',
        name: 'x',
        prefix: 'tsn_aaaaaa',
        createdAt: 1,
        lastUsedAt: null,
        token: 'tsn_T',
      }),
    );
    await client.issue('x', { scopes: ['study_sessions:write', 'study_sessions:read'], expiresInDays: 90 });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      name: 'x',
      scopes: ['study_sessions:write', 'study_sessions:read'],
      expiresInDays: 90,
    });
  });

  it('maps invalid scopes / expiry to invalid_options', async () => {
    const bad = await api(() => json(400, { error: 'invalid_expiry' })).client.issue('x');
    expect(!bad.ok && bad.kind).toBe('invalid_options');
  });

  it('maps server errors to friendly kinds', async () => {
    expect((await api(() => json(400, { error: 'invalid_name' })).client.issue('')).ok).toBe(false);
    const full = await api(() => json(409, { error: 'too_many_tokens' })).client.issue('x');
    expect(!full.ok && full.kind).toBe('too_many_keys');
    const gone = await api(() => json(404, { error: 'not_found' })).client.revoke('k');
    expect(!gone.ok && gone.kind).toBe('not_found');
  });

  it('treats 401 and a missing cookie as an invalid session, and fetch failures as network errors', async () => {
    const unauth = await api(() => json(401, { error: 'unauthorized' })).client.list();
    expect(!unauth.ok && unauth.kind).toBe('session_invalid');
    const noCookie = await api(() => json(200, { tokens: [] }), '').client.list();
    expect(!noCookie.ok && noCookie.kind).toBe('session_invalid');
    const offline = await api(() => {
      throw new TypeError('offline');
    }).client.list();
    expect(!offline.ok && offline.kind).toBe('network');
  });

  it('revokes by encoded id', async () => {
    const { client, calls } = api(() => json(200, { revoked: true }));
    expect((await client.revoke('a/b')).ok).toBe(true);
    expect(calls[0]?.url).toBe('https://api.example.com/v1/api-tokens/a%2Fb');
    expect(calls[0]?.init.method).toBe('DELETE');
  });
});

describe('describeApiKeyUsage', () => {
  const now = new Date(2026, 8, 13, 12, 0).getTime();
  it('shows the creation date and the last use', () => {
    const created = new Date(2026, 8, 1).getTime();
    expect(describeApiKeyUsage({ createdAt: created, lastUsedAt: now - 3 * 60_000 }, now)).toBe(
      '作成 9/1 · 最終使用 3分前',
    );
    expect(describeApiKeyUsage({ createdAt: created, lastUsedAt: now - 26 * 3600_000 }, now)).toBe(
      '作成 9/1 · 最終使用 昨日',
    );
    expect(describeApiKeyUsage({ createdAt: created, lastUsedAt: null }, now)).toBe(
      '作成 9/1 · 最終使用 未使用',
    );
  });

  it('describes permissions and expiry, treating old responses as write-only', () => {
    expect(describeApiKeyAccess({}, now)).toBe('登録');
    expect(
      describeApiKeyAccess(
        {
          scopes: ['study_sessions:write', 'study_sessions:read'],
          expiresAt: new Date(2027, 0, 27).getTime(),
        },
        now,
      ),
    ).toBe('登録 · 読み取り · 期限 1/27');
    expect(describeApiKeyAccess({ scopes: ['study_sessions:read'], expiresAt: now - 1 }, now)).toBe(
      '読み取り · 期限切れ',
    );
  });

  it('masks the key after its prefix', () => {
    expect(maskedApiKey('tsn_a1b2c3')).toBe('tsn_a1b2c3••••');
  });
});
