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
  /** 中断されると進行中の通信を止める(アカウント切替・ログアウト) */
  signal?: AbortSignal;
};

/** Better Auth のセッションCookieで認証する同期APIクライアント。本文・URLにユーザーIDは載せない */
export function createHttpTransport({
  baseUrl,
  getCookie,
  fetchImpl = fetch,
  timeoutMs = 30_000,
}: Options): SyncTransport {
  const send = createAuthedRequest({ baseUrl, getCookie, fetchImpl, timeoutMs });

  async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
    const res = await send(path, {
      method: init.method,
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : {},
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
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

/**
 * セッションCookie付きでAPIを呼ぶ共通処理(同期・画像で共用)。通信失敗は SyncNetworkError、
 * 401/403 は SyncAuthError。それ以外のステータスは呼び出し側が判断する。
 */
export function createAuthedRequest({
  baseUrl,
  getCookie,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  signal,
}: Options) {
  return async function send(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string | Uint8Array },
  ): Promise<Response> {
    if (signal?.aborted) throw new SyncNetworkError('同期は中断されました');
    const cookie = await getCookie();
    if (!cookie) throw new SyncAuthError('ログインが必要です');
    if (signal?.aborted) throw new SyncNetworkError('同期は中断されました');
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: init.method,
        headers: { cookie, ...init.headers },
        body: init.body as BodyInit | undefined,
        // Cookie は上で明示的に付ける。端末のCookieストアには依存しない
        credentials: 'omit',
        signal: controller.signal,
      });
    } catch {
      throw new SyncNetworkError('サーバーに接続できません');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if (res.status === 401 || res.status === 403) throw new SyncAuthError('再ログインが必要です');
    return res;
  };
}
