/** Workers の Bindings。秘密情報は wrangler secret で注入する(コミットしない)。 */
export type Bindings = {
  DB: D1Database;
  /** 秘密: 32文字以上のランダム文字列 */
  BETTER_AUTH_SECRET: string;
  /** APIの公開URL(メール内リンクの生成に使用) */
  BETTER_AUTH_URL: string;
  /** 秘密: Resend APIキー。未設定の場合は development のみメール送信をスキップする */
  RESEND_API_KEY?: string;
  /** 送信元(Resendで認証済みドメイン) */
  EMAIL_FROM: string;
  /** development | production のみ有効(未設定・不正値は500で停止) */
  APP_ENV: string;
  /** アプリのURL scheme(メール内リンクのリダイレクト先) */
  APP_SCHEME: string;
  /** Universal Links 用のHTTPS origin(任意。設定すると `<origin>/auth/<path>` も遷移先に許可) */
  APP_UNIVERSAL_LINK_ORIGIN?: string;
  /** Sign in with Apple を有効にするアプリの Bundle ID(未設定ならApple無効) */
  APPLE_APP_BUNDLE_ID?: string;
  /** Google OAuth の iOS クライアントID(カンマ区切りで複数可。未設定ならGoogle無効) */
  GOOGLE_CLIENT_IDS?: string;
};
