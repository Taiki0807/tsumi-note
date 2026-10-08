import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { existingAccountEmail, passwordResetEmail, verificationEmail, type EmailSender } from './email';
import * as schema from './db/schema';
import { createRedirectPolicy, parseAppEnvironment } from './redirect-policy';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validatePassword } from './password-policy';

type AdapterDb = Parameters<typeof drizzleAdapter>[0];

export type AuthDeps = {
  db: AdapterDb;
  secret: string;
  baseURL: string;
  appScheme: string;
  sendEmail: EmailSender;
  /** Workers の ctx.waitUntil。メール送信の完了待ちでレスポンスが遅れ、登録済み判定が時間差で漏れるのを防ぐ */
  waitUntil?: (promise: Promise<unknown>) => void;
  /** 'production' | 'development' 以外は例外(安全側に失敗) */
  environment: string;
  /** Universal Links 用のHTTPS origin(任意) */
  universalLinkOrigin?: string;
};

/** リダイレクト先として検証するbody/queryのキー */
const REDIRECT_KEYS = ['callbackURL', 'redirectTo', 'errorCallbackURL', 'newUserCallbackURL'] as const;

/** 確認・再設定トークンの有効期限(秒) */
export const TOKEN_TTL_SECONDS = 60 * 60;

/** パスワードを受け取るエンドポイントとbody上のフィールド名 */
const PASSWORD_FIELDS: Record<string, string> = {
  '/sign-up/email': 'password',
  '/reset-password': 'newPassword',
  '/change-password': 'newPassword',
};

/**
 * エンドポイント別レート制限(IP単位・D1保存)。
 * 再送系は1分1回に制限してメール爆撃・列挙を防ぐ。
 */
export const RATE_LIMIT_RULES = {
  '/sign-in/email': { window: 60, max: 5 },
  '/sign-up/email': { window: 300, max: 5 },
  '/send-verification-email': { window: 60, max: 1 },
  '/request-password-reset': { window: 60, max: 1 },
  '/forget-password': { window: 60, max: 1 },
  '/reset-password': { window: 60, max: 5 },
  '/change-password': { window: 60, max: 5 },
  '/verify-email': { window: 60, max: 10 },
} as const;

export function createAuth(deps: AuthDeps) {
  const environment = parseAppEnvironment(deps.environment);
  const isProduction = environment === 'production';
  if (isProduction && new URL(deps.baseURL).protocol !== 'https:') {
    throw new Error('production の BETTER_AUTH_URL は https が必須です');
  }
  const redirects = createRedirectPolicy({
    environment,
    appScheme: deps.appScheme,
    universalLinkOrigin: deps.universalLinkOrigin,
  });
  const queue = (task: Promise<void>) => {
    // 送信失敗は握りつぶさずログ(個人情報なし)に残す
    const guarded = task.catch((e: unknown) => {
      console.error('[email] 送信に失敗しました', e instanceof Error ? e.message : 'unknown');
    });
    if (!deps.waitUntil) return guarded;
    deps.waitUntil(guarded);
    return Promise.resolve();
  };

  return betterAuth({
    secret: deps.secret,
    baseURL: deps.baseURL,
    database: drizzleAdapter(deps.db, { provider: 'sqlite', schema }),
    // Origin検証用の `<scheme>://` と完全一致の遷移先URL(development のみ exp:// を追加)。
    // Better Auth は遷移先にも同じ一覧を使うため、遷移先の最終判断は下の before hook で行う
    trustedOrigins: redirects.trustedOrigins,
    plugins: [expo()],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: TOKEN_TTL_SECONDS,
      // 再設定後は全端末のセッションを失効させる
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await queue(deps.sendEmail({ to: user.email, ...passwordResetEmail(url) }));
      },
      // 登録済みメールでの再登録は、応答を変えず本人にだけ通知する(列挙対策)
      onExistingUserSignUp: async ({ user }) => {
        await queue(deps.sendEmail({ to: user.email, ...existingAccountEmail() }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      // 確認後に自動ログインしない。Expoプラグインはカスタムschemeへの遷移URLにSet-Cookieを
      // cookieクエリとして付与し、同じschemeを登録した別アプリにセッションが漏れるため。
      // 確認後はアプリで改めてログインさせる
      autoSignInAfterVerification: false,
      expiresIn: TOKEN_TTL_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await queue(deps.sendEmail({ to: user.email, ...verificationEmail(url) }));
      },
    },
    // 異なる認証方式のメール一致による自動統合は行わない(連携は将来、再認証を伴う別フローで追加)
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: RATE_LIMIT_RULES,
    },
    advanced: {
      // Cloudflare が付与するヘッダーのみ信頼する(x-forwarded-for は偽装可能)
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      useSecureCookies: isProduction,
      // NODE_ENV=test で Origin 検証が暗黙に無効化されるのを防ぎ、常に有効にする
      disableOriginCheck: false,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // リダイレクト先は許可リストとの完全一致のみ。トークンを付けて遷移するため全エンドポイントで検証する
        const query = (ctx.query ?? {}) as Record<string, unknown>;
        const reqBody = (ctx.body ?? {}) as Record<string, unknown>;
        for (const key of REDIRECT_KEYS) {
          for (const value of [query[key], reqBody[key]]) {
            if (value === undefined || value === null || value === '') continue;
            if (!redirects.isAllowedRedirect(value)) {
              throw new APIError('FORBIDDEN', { message: `Invalid ${key}` });
            }
          }
        }
        const field = PASSWORD_FIELDS[ctx.path];
        if (!field) return;
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const message = validatePassword(body[field], body.email);
        if (message) throw new APIError('BAD_REQUEST', { message });
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
