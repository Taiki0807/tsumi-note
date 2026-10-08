/**
 * メール確認・パスワード再設定のリダイレクト先(callbackURL / redirectTo 等)の許可リスト。
 *
 * 再設定トークンは遷移先URLへ付加されるため、遷移先は「完全一致」でのみ許可する。
 * scheme だけの信頼(例: `tsumi-note://`)は、任意の host / path への転送を許してしまう。
 * 正規化に頼らず、危険な表現(%エンコード・userinfo・バックスラッシュ・大文字小文字違い・
 * 末尾スラッシュ・query/fragment)は文字種の段階で拒否する。
 */

export type AppEnvironment = 'development' | 'production';

/** アプリが受け取る遷移先の path(PR 2 のアプリ側 deep link と一致させる) */
export const APP_REDIRECT_PATHS = {
  verified: 'verified',
  resetPassword: 'reset-password',
} as const;

/** 安全な文字のみ許可。%・@・\・空白・制御文字・?・# はここで弾かれる */
const SAFE_URL = /^[A-Za-z0-9._~:/-]+$/;
const SCHEME = /^[a-z][a-z0-9-]*$/;

/** 開発用(Expo Go)のローカル/プライベートホスト: exp://<host>:<port>/--/<path> */
const DEV_HOST =
  /^(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):\d{1,5}$/;

export type RedirectPolicy = {
  /**
   * Better Auth の trustedOrigins 用。次の2種類を含む。
   * - リクエストの Origin 検証用: アプリ自身の Origin(`<scheme>://`。Expo クライアントが expo-origin として送る値)
   * - 完全一致のリダイレクト先URL
   * Better Auth は Origin とリダイレクト先に同じ一覧を使うため、`<scheme>://` はリダイレクト先としても
   * 通ってしまう。リダイレクト先の最終判断は必ず isAllowedRedirect(auth.ts の before hook)で行う。
   */
  trustedOrigins: string[];
  isAllowedRedirect: (url: unknown) => boolean;
};

export function parseAppEnvironment(value: unknown): AppEnvironment {
  if (value === 'production' || value === 'development') return value;
  // 未設定・不正値は安全側に失敗させる(development へフォールバックしない)
  throw new Error('APP_ENV は "production" または "development" を指定してください');
}

export function createRedirectPolicy(opts: {
  environment: AppEnvironment;
  appScheme: string;
  /** Universal Links 用のHTTPS origin(任意。例: https://links.example.com) */
  universalLinkOrigin?: string;
}): RedirectPolicy {
  const { environment, appScheme, universalLinkOrigin } = opts;
  if (!SCHEME.test(appScheme) || appScheme === 'exp' || appScheme === 'http' || appScheme === 'https') {
    throw new Error('APP_SCHEME が不正です');
  }
  const paths = Object.values(APP_REDIRECT_PATHS);
  const exact = new Set<string>(paths.map((p) => `${appScheme}://${p}`));

  if (universalLinkOrigin) {
    if (!/^https:\/\/[a-z0-9.-]+$/.test(universalLinkOrigin)) {
      throw new Error('APP_UNIVERSAL_LINK_ORIGIN は https://<host> の形式で指定してください');
    }
    for (const p of paths) exact.add(`${universalLinkOrigin}/auth/${p}`);
  }

  const devPaths = new Set(paths.map((p) => `/--/${p}`));

  function isAllowedRedirect(url: unknown): boolean {
    if (typeof url !== 'string' || url.length === 0 || url.length > 200) return false;
    // API自身のルート(同一オリジン)への既定の遷移は安全なので許可する
    if (url === '/') return true;
    if (!SAFE_URL.test(url)) return false;
    if (exact.has(url)) return true;
    if (environment === 'development') {
      const m = /^exp:\/\/([^/]+)(\/.*)$/.exec(url);
      if (m && DEV_HOST.test(m[1]!) && devPaths.has(m[2]!)) return true;
    }
    return false;
  }

  return {
    trustedOrigins: [`${appScheme}://`, ...exact, ...(environment === 'development' ? ['exp://'] : [])],
    isAllowedRedirect,
  };
}
