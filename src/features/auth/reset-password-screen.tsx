import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/form-ui';

import { useAuth } from './auth-context';
import {
  AuthScaffold,
  goHome,
  Notice,
  PasswordInput,
  PasswordRequirements,
  ScreenHeading,
  TextLink,
} from './auth-ui';
import { parseResetLink } from './deep-link';
import { useSubmit } from './use-submit';
import { validateConfirmation, validateNewPassword } from './validation';

/**
 * `tsumi-note://reset-password?token=…` の着地画面(Figma 未デザイン)。
 * トークンは形式検証を通ったものだけ受け付け、保存・ログ出力はしない。完了後は全端末のセッションが失効するため再ログインさせる。
 */
export function ResetPasswordScreen() {
  const { api } = useAuth();
  const params = useLocalSearchParams();
  const { token } = parseResetLink(params);
  const { busy, error, run } = useSubmit();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);

  const passwordError = touched ? validateNewPassword(password) : null;
  const confirmError = touched ? validateConfirmation(password, confirmation) : null;

  const submit = async () => {
    setTouched(true);
    if (!token || validateNewPassword(password) || validateConfirmation(password, confirmation)) return;
    const result = await run(() => api.resetPassword(token, password));
    if (result?.ok) setDone(true);
  };

  if (!token) {
    return (
      <AuthScaffold
        title="パスワードの再設定"
        footer={
          <Button label="再設定メールを送り直す" onPress={() => router.replace('/account/forgot-password')} />
        }
      >
        <ScreenHeading
          title="リンクが無効です"
          description="リンクが無効か、有効期限が切れています。もう一度、再設定メールを送信してください。"
        />
        <Notice tone="error">パスワードを再設定できません。</Notice>
        <TextLink size="sm" label="アカウントなしで利用を続ける" onPress={goHome} />
      </AuthScaffold>
    );
  }

  if (done) {
    return (
      <AuthScaffold
        title="パスワードの再設定"
        footer={<Button label="ログインへ進む" onPress={() => router.replace('/account/login')} />}
      >
        <ScreenHeading
          title="パスワードを変更しました"
          description="新しいパスワードでログインしてください。"
        />
        <Notice tone="success">安全のため、すべての端末からログアウトされました。</Notice>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="パスワードの再設定"
      footer={
        <Button label={busy ? '送信中…' : 'パスワードを変更'} disabled={busy} onPress={() => void submit()} />
      }
    >
      <ScreenHeading title="新しいパスワード" description="10文字以上で、英字と数字を含めてください。" />
      <PasswordInput
        isNew
        label="新しいパスワード"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        editable={!busy}
      />
      <PasswordRequirements password={password} email="" />
      <PasswordInput
        isNew
        label="新しいパスワード（確認）"
        value={confirmation}
        onChangeText={setConfirmation}
        error={confirmError}
        editable={!busy}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
    </AuthScaffold>
  );
}
