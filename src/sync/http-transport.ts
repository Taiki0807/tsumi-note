import type { SyncTransport } from './engine';

/** 再認証が必要(セッション切れ・メール未確認)。再試行しても成功しない */
export class SyncAuthError extends Error {}
/** 通信できない(オフライン・タイムアウト)。接続が戻れば再試行する */
export class SyncNetworkError extends Error {}
/** サーバーが一時的に失敗した、または要求を拒否した */
export class SyncServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Options = {
  baseUrl: string;
  /** 現在のセッションCookie(Keychainから読む)。ログアウト後は空になり、401で止まる */
  getCookie: () => Promise<string> | string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Better Auth のセッションCookieで認証する同期APIクライアント。本文・URLにユーザーIDは載せない */
export function createHttpTransport({
  baseUrl,
  getCookie,
  fetchImpl = fetch,
  timeoutMs = 30_000,
}: Options): SyncTransport {
  async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
    const cookie = await getCookie();
    if (!cookie) throw new SyncAuthError('ログインが必要です');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: init.method,
        headers: { cookie, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        // Cookie は上で明示的に付ける。端末のCookieストアには依存しない
        credentials: 'omit',
        signal: controller.signal,
      });
    } catch {
      throw new SyncNetworkError('サーバーに接続できません');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new SyncAuthError('再ログインが必要です');
    if (!res.ok) throw new SyncServerError(`同期に失敗しました (${res.status})`, res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new SyncServerError('サーバーの応答が不正です', res.status);
    }
  }

  return {
    push: (changes) => call('/v1/sync/push', { method: 'POST', body: { changes } }),
    pull: (cursor, limit) => call(`/v1/sync/pull?cursor=${cursor}&limit=${limit}`, { method: 'GET' }),
  };
}
