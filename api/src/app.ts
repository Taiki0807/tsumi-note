import { Hono, type Context } from 'hono';
import type { Auth } from './auth';
import { pullChanges, pushChanges, type SyncDriver } from './sync/service';
import { MAX_PUSH_BODY_CHARS, parseCursor, parseLimit, parsePush, ValidationError } from './sync/validate';

/** 認証情報(セッションCookie等)を遷移先URLに載せてはならないエンドポイント */
const NO_CREDENTIAL_REDIRECT = /^\/api\/auth\/(verify-email|reset-password(\/.*)?)$/;
const CREDENTIAL_QUERY_KEYS = ['cookie', 'session_token', 'bearer', 'access_token'];

/**
 * 多層防御: 確認・再設定リンクのレスポンスから Set-Cookie と、遷移先URLの認証情報クエリを除去する。
 * (autoSignInAfterVerification を無効にしていても、設定変更やプラグイン挙動で漏れないようにする)
 */
export function stripCredentialsFromRedirect(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.delete('set-cookie');
  const location = headers.get('location');
  if (location) {
    try {
      const url = new URL(location, 'http://placeholder.invalid');
      let changed = false;
      for (const key of CREDENTIAL_QUERY_KEYS) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) {
        const absolute = /^[a-z][a-z0-9+.-]*:/i.test(location);
        headers.set('location', absolute ? url.toString() : url.pathname + url.search);
      }
    } catch {
      headers.delete('location'); // 解釈できない遷移先は安全側で除去
    }
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export type AppVariables = {
  userId: string;
};

type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Hono アプリ。auth の生成方法(D1 / テスト用SQLite)は呼び出し側が決める。
 * ユーザーIDは必ず検証済みセッションから取得し、リクエスト本文・クエリのIDは信用しない。
 */
export function createApp(getAuth: (waitUntil?: WaitUntil) => Auth, getSyncDriver?: () => SyncDriver) {
  const app = new Hono<{ Variables: AppVariables }>();

  const waitUntilOf = (c: Context): WaitUntil | undefined => {
    try {
      const ctx = c.executionCtx;
      return (p) => ctx.waitUntil(p);
    } catch {
      return undefined; // Workers外(テスト)では executionCtx が無い
    }
  };

  app.get('/health', (c) => c.json({ ok: true }));

  // Better Auth(/api/auth/*)。メール確認・再設定リンクもここで処理する
  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    const res = await getAuth(waitUntilOf(c)).handler(c.req.raw);
    return NO_CREDENTIAL_REDIRECT.test(c.req.path) ? stripCredentialsFromRedirect(res) : res;
  });

  // 以降のAPI(同期など)で共通利用する認証必須ミドルウェア
  app.use('/v1/*', async (c, next) => {
    const session = await getAuth(waitUntilOf(c)).api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    if (!session.user.emailVerified) return c.json({ error: 'email_not_verified' }, 403);
    c.set('userId', session.user.id);
    await next();
  });

  // セッション復元・認可の動作確認用
  app.get('/v1/me', (c) => c.json({ id: c.get('userId') }));

  // ---- 差分同期。ユーザーは常にセッション由来(本文・クエリにユーザーIDは存在しない) ----
  const syncDriver = (): SyncDriver => {
    if (!getSyncDriver) throw new Error('sync is not configured');
    return getSyncDriver();
  };

  app.post('/v1/sync/push', async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_PUSH_BODY_CHARS * 4) return c.json({ error: 'payload_too_large' }, 413);
    const text = await c.req.text();
    if (text.length > MAX_PUSH_BODY_CHARS) return c.json({ error: 'payload_too_large' }, 413);
    try {
      const { changes } = parsePush(JSON.parse(text));
      const userId = c.get('userId');
      const results = await pushChanges(syncDriver(), userId, changes);
      return c.json({ userId, results });
    } catch (e) {
      if (e instanceof ValidationError) return c.json({ error: 'invalid_request', message: e.message }, 400);
      if (e instanceof SyntaxError)
        return c.json({ error: 'invalid_request', message: 'JSONが不正です' }, 400);
      throw e;
    }
  });

  app.get('/v1/sync/pull', async (c) => {
    try {
      const cursor = parseCursor(c.req.query('cursor'));
      const limit = parseLimit(c.req.query('limit'));
      const userId = c.get('userId');
      const page = await pullChanges(syncDriver(), userId, cursor, limit);
      return c.json({ userId, ...page });
    } catch (e) {
      if (e instanceof ValidationError) return c.json({ error: 'invalid_request', message: e.message }, 400);
      throw e;
    }
  });

  return app;
}
