/**
 * 認証APIクライアントの薄いラッパー。
 * Better Auth クライアントの `{ data, error }` を、画面が扱いやすい結果型と日本語メッセージに変換する。
 * クライアントは注入できるので、テストではネットワークなしで検証できる。
 */
export type AuthFailureKind =
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'rate_limited'
  | 'network'
  | 'invalid_token'
  | 'validation'
  | 'unavailable'
  | 'cancelled'
  | 'unknown';

export type AuthResult<T = void> =
  { ok: true; data: T } | { ok: false; kind: AuthFailureKind; message: string };

type ClientError = { status?: number; code?: string; message?: string } | null | undefined;
type ClientResponse<T = unknown> = Promise<{ data: T | null; error: ClientError }>;

/** 使用する Better Auth クライアントの範囲(テストで差し替え可能にするための最小インターフェース) */
export type AuthClientLike = {
  signUp: {
    email(input: { email: string; password: string; name: string; callbackURL: string }): ClientResponse;
  };
  signIn: {
    email(input: { email: string; password: string }): ClientResponse;
    social(input: {
      provider: 'apple' | 'google';
      idToken: { token: string; nonce?: string };
    }): ClientResponse;
  };
  sendVerificationEmail(input: { email: string; callbackURL: string }): ClientResponse;
  requestPasswordReset(input: { email: string; redirectTo: string }): ClientResponse;
  resetPassword(input: { newPassword: string; token: string }): ClientResponse;
  signOut(): ClientResponse;
};

/** メール内リンクの戻り先。API の許可リスト(redirect-policy.ts)と完全一致させる */
export function redirectUrls(scheme: string) {
  return { verified: `${scheme}://verified`, resetPassword: `${scheme}://reset-password` } as const;
}

const MESSAGES: Record<AuthFailureKind, string> = {
  invalid_credentials: 'メールアドレスまたはパスワードが正しくありません。',
  email_not_verified: 'メールアドレスの確認が完了していません。届いたメールのリンクを開いてください。',
  rate_limited: '操作の回数が多すぎます。しばらく待ってからもう一度お試しください。',
  network:
    '通信できませんでした。接続を確認して、もう一度お試しください。学習データは端末に保存されています。',
  invalid_token: 'リンクが無効か、有効期限が切れています。もう一度メールを送信してください。',
  validation: '入力内容を確認してください。',
  unavailable: 'アカウント機能はこのビルドでは利用できません。',
  cancelled: 'キャンセルしました。',
  unknown: '問題が発生しました。時間をおいてもう一度お試しください。',
};

export function failure(
  kind: AuthFailureKind,
  message?: string,
): { ok: false; kind: AuthFailureKind; message: string } {
  return { ok: false, kind, message: message ?? MESSAGES[kind] };
}

export function classifyError(error: NonNullable<ClientError>): AuthFailureKind {
  const code = (error.code ?? '').toUpperCase();
  if (error.status === 429) return 'rate_limited';
  if (code === 'EMAIL_NOT_VERIFIED' || (error.status === 403 && /verif/i.test(error.message ?? ''))) {
    return 'email_not_verified';
  }
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_PASSWORD' || code === 'USER_NOT_FOUND') {
    return 'invalid_credentials';
  }
  if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') return 'invalid_token';
  if (error.status === 401) return 'invalid_credentials';
  if (error.status === 400 || error.status === 422) return 'validation';
  // fetch の失敗(オフライン等)は status が無い/0 になる
  if (!error.status) return 'network';
  return 'unknown';
}

async function run<T>(call: () => ClientResponse<T>): Promise<AuthResult<T | null>> {
  try {
    const { data, error } = await call();
    if (error) {
      const kind = classifyError(error);
      // APIが返す検証メッセージ(パスワードポリシー違反など)は利用者向けの日本語なのでそのまま使う
      const apiMessage = kind === 'validation' && error.message && /[^\x00-\x7F]/.test(error.message);
      return failure(kind, apiMessage ? error.message : undefined);
    }
    return { ok: true, data };
  } catch {
    return failure('network');
  }
}

export function createAuthApi(client: AuthClientLike | null, scheme: string) {
  const urls = redirectUrls(scheme);
  const guard = async <T>(call: (c: AuthClientLike) => ClientResponse<T>): Promise<AuthResult<T | null>> =>
    client ? run(() => call(client)) : failure('unavailable');

  return {
    /** 登録済みメールでも同じ結果を返す(列挙対策はAPI側)。成功したら確認メール案内へ進める */
    signUp: (email: string, password: string) =>
      guard((c) =>
        c.signUp.email({ email, password, name: email.split('@')[0] ?? '', callbackURL: urls.verified }),
      ),
    signIn: (email: string, password: string) => guard((c) => c.signIn.email({ email, password })),
    signInWithIdToken: (provider: 'apple' | 'google', token: string, nonce?: string) =>
      guard((c) => c.signIn.social({ provider, idToken: { token, nonce } })),
    resendVerification: (email: string) =>
      guard((c) => c.sendVerificationEmail({ email, callbackURL: urls.verified })),
    requestPasswordReset: (email: string) =>
      guard((c) => c.requestPasswordReset({ email, redirectTo: urls.resetPassword })),
    resetPassword: (token: string, newPassword: string) =>
      guard((c) => c.resetPassword({ token, newPassword })),
    signOut: () => guard((c) => c.signOut()),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
