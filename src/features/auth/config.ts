/**
 * 認証の環境別設定。値は EXPO_PUBLIC_* 環境変数(ビルド時に埋め込まれる公開値)から読む。
 * 秘密情報(クライアントシークレット・APIキー)はアプリに含めない。
 */
export type AuthConfig = {
  /** 認証APIのURL。未設定なら認証機能は無効(ゲスト利用のみ) */
  apiUrl: string | null;
  /** Google OAuth の iOS クライアントID。未設定なら Google ログインは無効 */
  googleIosClientId: string | null;
  /** アプリのURL scheme(app.json の scheme と一致させる) */
  scheme: string;
};

const SCHEME = 'tsumi-note';

/** 末尾スラッシュを除いた https URL(開発時のみ http の localhost / プライベートIPを許可)を返す。不正なら null */
export function normalizeApiUrl(value: string | undefined, isDev: boolean): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const local =
    /^(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;
  const allowed =
    url.protocol === 'https:' || (isDev && url.protocol === 'http:' && local.test(url.hostname));
  if (!allowed) return null;
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export function readAuthConfig(
  env: Record<string, string | undefined> = process.env,
  isDev: boolean = typeof __DEV__ !== 'undefined' && __DEV__,
): AuthConfig {
  return {
    apiUrl: normalizeApiUrl(env.EXPO_PUBLIC_API_URL, isDev),
    googleIosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || null,
    scheme: SCHEME,
  };
}
