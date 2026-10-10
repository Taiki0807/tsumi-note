import { createHttpTransport, SyncAuthError, SyncNetworkError, SyncServerError } from './http-transport';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('http transport', () => {
  it('セッションCookieを付けて送り、本文にユーザーIDを含めない', async () => {
    const fetchImpl = jest.fn(async () => ok({ userId: 'u', results: [] }));
    const t = createHttpTransport({ baseUrl: 'https://api.test', getCookie: () => 'sid=abc', fetchImpl });
    await t.push([]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/sync/push');
    expect((init.headers as Record<string, string>).cookie).toBe('sid=abc');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body as string)).toEqual({ changes: [] });
  });

  it('カーソルとlimitをクエリで渡す', async () => {
    const fetchImpl = jest.fn(async () => ok({ userId: 'u', changes: [], nextCursor: 0, hasMore: false }));
    const t = createHttpTransport({ baseUrl: 'https://api.test', getCookie: () => 'sid=abc', fetchImpl });
    await t.pull(12, 50);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.test/v1/sync/pull?cursor=12&limit=50',
    );
  });

  it('Cookieが無い(ログアウト済み)なら通信せず認証エラー', async () => {
    const fetchImpl = jest.fn();
    const t = createHttpTransport({ baseUrl: 'https://api.test', getCookie: () => '', fetchImpl });
    await expect(t.pull(0, 10)).rejects.toBeInstanceOf(SyncAuthError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('401/403は認証エラー、通信失敗はネットワークエラー、5xxはサーバーエラー', async () => {
    const make = (impl: () => Promise<Response>) =>
      createHttpTransport({
        baseUrl: 'https://api.test',
        getCookie: () => 'sid=1',
        fetchImpl: impl as never,
      });
    await expect(make(async () => new Response('', { status: 401 })).pull(0, 1)).rejects.toBeInstanceOf(
      SyncAuthError,
    );
    await expect(make(async () => new Response('', { status: 403 })).pull(0, 1)).rejects.toBeInstanceOf(
      SyncAuthError,
    );
    await expect(
      make(async () => {
        throw new TypeError('Network request failed');
      }).pull(0, 1),
    ).rejects.toBeInstanceOf(SyncNetworkError);
    await expect(make(async () => new Response('', { status: 503 })).pull(0, 1)).rejects.toBeInstanceOf(
      SyncServerError,
    );
  });
});
