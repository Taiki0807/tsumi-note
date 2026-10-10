import { useCallback, useEffect, useState } from 'react';

import { createAccountApi, performAccountDeletion } from '@/features/account/account-api';
import { AccountCardView } from '@/features/account/account-card';
import { purgeStorage } from '@/db/local-purge-native';
import { requestLocalPurge } from '@/db/local-purge';
import { useSync } from '@/sync/sync-provider';

import { authClient } from './auth-client';
import { useAuth } from './auth-context';
import { readAuthConfig } from './config';

/**
 * ログイン中のマイページのアカウントカード(接続部分)。
 * ログアウトはアカウント別DB・画像・R2を削除しない(ゲストDBへ戻るだけ)。
 * アカウント削除はサーバーでの完了後にだけ、この端末のアカウントデータの削除を予約してサインアウトする。
 */
export function SignedInCard({ email }: { email: string }) {
  const { api, state } = useAuth();
  const sync = useSync();
  const [providers, setProviders] = useState<string[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = state.status === 'signedIn' ? state.user.id : null;

  const accountApi = useCallback(() => {
    const apiUrl = readAuthConfig().apiUrl;
    const client = authClient;
    if (!apiUrl || !client) return null;
    return createAccountApi({ baseUrl: apiUrl, getCookie: () => client.getCookie() });
  }, []);

  useEffect(() => {
    let active = true;
    const account = accountApi();
    if (!account) return;
    void account.fetchInfo().then((r) => active && r.ok && setProviders(r.data.providers));
    return () => {
      active = false;
    };
  }, [accountApi, attempt]);

  return (
    <AccountCardView
      email={email}
      providers={providers}
      sync={sync}
      onRetryInfo={() => setAttempt((n) => n + 1)}
      // 進行中の同期は、サインアウトでこの画面ごと破棄されるときに SyncProvider が停止する
      onLogout={() => api.signOut()}
      onDelete={async (password) => {
        const account = accountApi();
        if (!account || !userId) {
          return {
            ok: false as const,
            kind: 'unknown' as const,
            message: 'アカウント機能を利用できません。',
          };
        }
        return performAccountDeletion({
          api: account,
          userId,
          password,
          requestLocalPurge: (id) => requestLocalPurge(purgeStorage, id),
          signOut: () => api.signOut(),
        });
      }}
    />
  );
}
