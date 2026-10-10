import { Hono, type Context } from 'hono';
import {
  consumeDeleteAttempt,
  deleteAccount,
  FRESH_SESSION_MS,
  getPasswordHash,
  isDeletionRequested,
  listProviders,
} from './account/service';
import type { Auth } from './auth';
import { deleteImage, getImage, putImage, type ObjectStore } from './images/service';
import { ImageError, MAX_IMAGE_BYTES, readBodyWithLimit } from './images/validate';
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
  email: string;
  /** 現在のセッションを作成した(=ログインした)時刻(epoch ms) */
  sessionCreatedAt: number;
};

type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Hono アプリ。auth の生成方法(D1 / テスト用SQLite)は呼び出し側が決める。
 * ユーザーIDは必ず検証済みセッションから取得し、リクエスト本文・クエリのIDは信用しない。
 */
export function createApp(
  getAuth: (waitUntil?: WaitUntil) => Auth,
  getSyncDriver?: () => SyncDriver,
  getImageStore?: () => ObjectStore,
) {
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
    c.set('email', session.user.email);
    c.set('sessionCreatedAt', new Date(session.session.createdAt).getTime());
    // 削除を依頼済みのアカウントは、削除の再試行以外すべて拒否する(他端末からの再同期・再アップロードを遮断)
    const isDeleteRetry = c.req.method === 'DELETE' && c.req.path === '/v1/account';
    if (getSyncDriver && !isDeleteRetry && (await isDeletionRequested(getSyncDriver(), session.user.id))) {
      return c.json({ error: 'account_deleted' }, 401);
    }
    await next();
  });

  // セッション復元・認可の動作確認用
  app.get('/v1/me', (c) => c.json({ id: c.get('userId') }));

  // ---- アカウント情報・削除。対象は常にセッション由来のユーザー(他人のIDは指定できない) ----
  app.get('/v1/account', async (c) => {
    const providers = await listProviders(syncDriver(), c.get('userId'));
    return c.json({ id: c.get('userId'), email: c.get('email'), providers });
  });

  app.delete('/v1/account', async (c) => {
    const userId = c.get('userId');
    const driver = syncDriver();
    let body: { confirm?: unknown; password?: unknown } = {};
    try {
      body = (await c.req.json()) ?? {};
    } catch {
      return c.json({ error: 'invalid_request' }, 400);
    }
    if (body.confirm !== true) return c.json({ error: 'confirmation_required' }, 400);

    // 本人確認: パスワードのアカウントは現在のパスワード、ソーシャルのみのアカウントは直近のログインを要求する
    const now = Date.now();
    const hash = await getPasswordHash(driver, userId);
    if (hash) {
      if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 256) {
        return c.json({ error: 'password_required' }, 403);
      }
      if (!(await consumeDeleteAttempt(driver, userId, now))) return c.json({ error: 'rate_limited' }, 429);
      const ctx = await getAuth(waitUntilOf(c)).$context;
      if (!(await ctx.password.verify({ hash, password: body.password }))) {
        return c.json({ error: 'invalid_password' }, 403);
      }
    } else if (now - c.get('sessionCreatedAt') > FRESH_SESSION_MS) {
      return c.json({ error: 'reauth_required' }, 403);
    }

    try {
      await deleteAccount(driver, imageDeps().store, userId, now);
    } catch {
      // 失敗の詳細(個人情報を含み得る)は返さない。同じ要求の再送で続きから完了する
      return c.json({ error: 'delete_incomplete' }, 500);
    }
    return c.json({ deleted: true });
  });

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

  // ---- ノート画像(R2)。ユーザーは常にセッション由来。オブジェクトキーはサーバーが決める ----
  const imageDeps = () => {
    if (!getImageStore) throw new Error('images are not configured');
    return { driver: syncDriver(), store: getImageStore() };
  };
  const imageError = (c: Context, e: unknown) => {
    if (e instanceof ImageError) return c.json({ error: e.code }, e.status);
    throw e;
  };

  app.put('/v1/images/:fileName', async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_IMAGE_BYTES) return c.json({ error: 'payload_too_large' }, 413);
    try {
      const { driver, store } = imageDeps();
      // Content-Length は信用せず、実際に受信したバイト数で上限を判定する(超過時は読み取りを中断)
      const bytes = await readBodyWithLimit(c.req.raw.body, MAX_IMAGE_BYTES);
      if (!bytes) return c.json({ error: 'payload_too_large' }, 413);
      const result = await putImage(
        driver,
        store,
        c.get('userId'),
        {
          fileName: c.req.param('fileName'),
          bytes,
          declaredSha256: c.req.header('x-content-sha256')?.toLowerCase(),
          contentType: c.req.header('content-type'),
        },
        Date.now(),
      );
      return c.json(result);
    } catch (e) {
      return imageError(c, e);
    }
  });

  app.get('/v1/images/:fileName', async (c) => {
    const { driver, store } = imageDeps();
    const image = await getImage(driver, store, c.get('userId'), c.req.param('fileName'));
    // 他人の画像・存在しない画像・削除済みはすべて同じ 404(存在を推測させない)
    if (!image) return c.json({ error: 'not_found' }, 404);
    return new Response(image.bytes as unknown as BodyInit, {
      headers: {
        'content-type': image.contentType,
        'x-content-sha256': image.sha256,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  });

  app.delete('/v1/images/:fileName', async (c) => {
    try {
      const { driver, store } = imageDeps();
      const result = await deleteImage(driver, store, c.get('userId'), c.req.param('fileName'), Date.now());
      return c.json({ result });
    } catch (e) {
      return imageError(c, e);
    }
  });

  return app;
}
