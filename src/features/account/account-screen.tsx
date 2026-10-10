import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import { SignedInCard } from '@/features/auth/signed-in-card';
import { SettingsScaffold } from '@/features/settings/settings-ui';

/**
 * Figma 17 アカウント(マイページのアカウント行から遷移)。同期状態・ログアウト・アカウント削除(確認は Figma 18)。
 * ログアウト / 削除でゲストに戻ったら、マイページへ戻る。
 */
export function AccountScreen() {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const loading = state.status === 'loading';

  useEffect(() => {
    if (!signedIn && !loading) router.replace('/mypage');
  }, [signedIn, loading]);

  if (state.status !== 'signedIn') return null;
  return (
    <SettingsScaffold title="アカウント">
      <SignedInCard email={state.user.email} />
    </SettingsScaffold>
  );
}
