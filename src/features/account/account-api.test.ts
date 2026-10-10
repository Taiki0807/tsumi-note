import { createAccountApi, performAccountDeletion, providerLabel } from './account-api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function api(fetchImpl: typeof fetch, cookie = 'session=abc') {
  return createAccountApi({ baseUrl: 'https://api.test', getCookie: () => cookie, fetchImpl });
}

describe('アカウントAPIクライアント', () => {
  it('アカウント情報(メール・ログイン方法)を取得する。URLにユーザーIDは載せない', async () => {
    const fetchImpl = jest.fn(async () =>
      json(200, { id: 'u1', email: 'a@example.com', providers: ['apple'] }),
    );
    const r = await api(fetchImpl as never).fetchInfo();
    expect(r).toEqual({ ok: true, data: { email: 'a@example.com', providers: ['apple'] } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/account');
    expect((init.headers as Record<string, string>).cookie).toBe('session=abc');
  });

  it('Cookieが無ければ通信せず session_invalid', async () => {
    const fetchImpl = jest.fn();
    const r = await api(fetchImpl as never, '').deleteAccount('pw');
    expect(r).toMatchObject({ ok: false, kind: 'session_invalid' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('削除は deleted:true が返ったときだけ成功', async () => {
    expect(await api((async () => json(200, { deleted: true })) as never).deleteAccount('pw')).toEqual({
      ok: true,
      data: null,
    });
    expect(await api((async () => json(200, {})) as never).deleteAccount('pw')).toMatchObject({
      ok: false,
      kind: 'incomplete',
    });
  });

  it.each([
    [403, 'invalid_password', 'invalid_password'],
    [403, 'password_required', 'password_required'],
    [403, 'reauth_required', 'reauth_required'],
    [429, 'rate_limited', 'rate_limited'],
    [401, 'account_deleted', 'session_invalid'],
    [500, 'delete_incomplete', 'incomplete'],
  ])('HTTP %s %s → %s', async (status, error, kind) => {
    const r = await api((async () => json(status, { error })) as never).deleteAccount('pw');
    expect(r).toMatchObject({ ok: false, kind });
  });

  it('通信失敗は network(端末のデータは削除されない旨を表示)', async () => {
    const r = await api((async () => Promise.reject(new Error('offline'))) as never).deleteAccount('pw');
    expect(r).toMatchObject({ ok: false, kind: 'network' });
    expect(!r.ok && r.message).toContain('削除されていません');
  });

  it('ログイン方法の表示名', () => {
    expect(providerLabel('credential')).toBe('メールアドレス');
    expect(providerLabel('apple')).toBe('Apple');
    expect(providerLabel('google')).toBe('Google');
  });
});

describe('performAccountDeletion', () => {
  const ok = { ok: true as const, data: null };

  it('サーバーが完了を返してから、端末データの削除を予約してサインアウトする', async () => {
    const order: string[] = [];
    const r = await performAccountDeletion({
      api: { deleteAccount: async () => (order.push('server'), ok) },
      userId: 'u1',
      requestLocalPurge: (id) => order.push(`purge:${id}`),
      signOut: async () => order.push('signOut'),
    });
    expect(r.ok).toBe(true);
    expect(order).toEqual(['server', 'purge:u1', 'signOut']);
  });

  it('サーバーが失敗したら、端末のデータにもセッションにも触れない(再試行できる)', async () => {
    const purge = jest.fn();
    const signOut = jest.fn();
    const r = await performAccountDeletion({
      api: { deleteAccount: async () => ({ ok: false, kind: 'network', message: 'x' }) },
      userId: 'u1',
      requestLocalPurge: purge,
      signOut,
    });
    expect(r.ok).toBe(false);
    expect(purge).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('サインアウトが失敗しても削除は成功として扱う(サーバー側は削除済み)', async () => {
    const r = await performAccountDeletion({
      api: { deleteAccount: async () => ok },
      userId: 'u1',
      requestLocalPurge: () => {},
      signOut: async () => {
        throw new Error('offline');
      },
    });
    expect(r.ok).toBe(true);
  });
});
