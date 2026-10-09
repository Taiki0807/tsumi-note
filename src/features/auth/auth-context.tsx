import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { createAuthApi, type AuthApi, type AuthClientLike } from './auth-api';
import { authClient, type AppAuthClient } from './auth-client';
import { deriveAuthState, type AuthState } from './auth-state';
import { readAuthConfig } from './config';

export type AuthContextValue = {
  state: AuthState;
  api: AuthApi;
  /** APIのURLが設定され、認証機能が使えるか */
  configured: boolean;
  googleIosClientId: string | null;
};

function build(client: AppAuthClient | null, session: unknown, isPending: boolean): AuthContextValue {
  const config = readAuthConfig();
  return {
    state: deriveAuthState({
      configured: client !== null,
      isPending,
      session: session as Parameters<typeof deriveAuthState>[0]['session'],
    }),
    api: createAuthApi(client as unknown as AuthClientLike | null, config.scheme),
    configured: client !== null,
    googleIosClientId: config.googleIosClientId,
  };
}

/** Provider の外(テスト等)では「認証機能なしのゲスト」として振る舞う */
export const AuthContext = createContext<AuthContextValue>(build(null, null, false));

/** 認証が有効なとき。保存済みセッション(SecureStore)を復元し、サーバーで更新する */
function ConfiguredProvider({ client, children }: { client: AppAuthClient; children: ReactNode }) {
  const { data, isPending } = client.useSession();
  const value = useMemo(() => build(client, data, isPending), [client, data, isPending]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 認証状態を提供する。ゲストでもアプリ全体は通常どおり使えるので、ここではログインを強制しない
 * (セッション読み込み中も子を描画する)。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const fallback = useMemo(() => build(null, null, false), []);
  if (!authClient) return <AuthContext.Provider value={fallback}>{children}</AuthContext.Provider>;
  return <ConfiguredProvider client={authClient}>{children}</ConfiguredProvider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
