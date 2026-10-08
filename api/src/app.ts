import { Hono, type Context } from 'hono';
import type { Auth } from './auth';

export type AppVariables = {
  userId: string;
};

type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Hono アプリ。auth の生成方法(D1 / テスト用SQLite)は呼び出し側が決める。
 * ユーザーIDは必ず検証済みセッションから取得し、リクエスト本文・クエリのIDは信用しない。
 */
export function createApp(getAuth: (waitUntil?: WaitUntil) => Auth) {
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
  app.on(['GET', 'POST'], '/api/auth/*', (c) => getAuth(waitUntilOf(c)).handler(c.req.raw));

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

  return app;
}
