/**
 * 認証状態の導出(純粋関数)。
 * セッションの読み込み中は 'loading'、無ければ 'signedOut'(=ゲスト)。
 * メール未確認のユーザーはAPIがセッションを発行しないので、ここでは扱わない。
 */
export type AuthUser = { id: string; email: string; name: string };
export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: AuthUser };

type SessionLike = { user?: { id?: unknown; email?: unknown; name?: unknown } | null } | null | undefined;

export function deriveAuthState(input: {
  /** 認証機能が有効か(APIのURLが設定されているか) */
  configured: boolean;
  isPending: boolean;
  session: SessionLike;
}): AuthState {
  if (!input.configured) return { status: 'signedOut', user: null };
  if (input.isPending && !input.session) return { status: 'loading', user: null };
  const user = input.session?.user;
  if (user && typeof user.id === 'string' && typeof user.email === 'string') {
    return {
      status: 'signedIn',
      user: { id: user.id, email: user.email, name: typeof user.name === 'string' ? user.name : '' },
    };
  }
  return { status: 'signedOut', user: null };
}
