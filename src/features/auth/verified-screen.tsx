import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/form-ui';

import { AuthScaffold, goHome, Notice, ScreenHeading, TextLink } from './auth-ui';
import { parseVerifiedLink } from './deep-link';

/**
 * `tsumi-note://verified` の着地画面(Figma 未デザイン)。確認後に自動ログインはしない。
 * 認証情報らしきクエリが付いたリンクや、不正なエラー値は失敗として扱う。
 */
export function VerifiedScreen() {
  const params = useLocalSearchParams();
  const link = parseVerifiedLink(params);
  const ok = link.error === null;
  return (
    <AuthScaffold
      title="メールの確認"
      footer={
        <>
          <Button label="ログインへ進む" onPress={() => router.replace('/account/login')} />
          <TextLink size="sm" label="アカウントなしで利用を続ける" onPress={goHome} />
        </>
      }
    >
      <ScreenHeading
        title={ok ? 'メールアドレスを確認しました' : '確認できませんでした'}
        description={
          ok
            ? 'ログインして、アカウントを使い始めましょう。'
            : 'リンクが無効か、有効期限が切れています。ログイン画面から確認メールを再送信してください。'
        }
      />
      <Notice tone={ok ? 'success' : 'error'}>{ok ? '確認が完了しました。' : '確認に失敗しました。'}</Notice>
    </AuthScaffold>
  );
}
