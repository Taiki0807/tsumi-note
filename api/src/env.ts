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
  /** development | production */
  APP_ENV: string;
  /** アプリのURL scheme(メール内リンクのリダイレクト先) */
  APP_SCHEME: string;
};
