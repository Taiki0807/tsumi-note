import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/form-ui';

import { useAuth } from './auth-context';
import {
  AuthInput,
  AuthScaffold,
  Notice,
  PasswordInput,
  PasswordRequirements,
  ScreenHeading,
  TextLink,
} from './auth-ui';
import { useSubmit } from './use-submit';
import { normalizeEmail, validateConfirmation, validateEmail, validateNewPassword } from './validation';

/**
 * Figma 14 メールで登録。メール・パスワード(+「表示」トグル・条件表示)・アカウントを作成ボタン・ログイン導線。
 * Figma に無い追加(未デザイン): パスワード確認欄(Issue §9.2)、エラー表示。
 * Figma の「この端末の記録は作成後そのまま…」の説明は、データ引き継ぎが PR 3 で実装されるまで表示しない。
 */
export function SignUpScreen() {
  const { api, configured } = useAuth();
  const { busy, error, run } = useSubmit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);

  const emailError = touched ? validateEmail(email) : null;
  const passwordError = touched ? validateNewPassword(password, email) : null;
  const confirmError = touched ? validateConfirmation(password, confirmation) : null;

  const submit = async () => {
    setTouched(true);
    if (
      validateEmail(email) ||
      validateNewPassword(password, email) ||
      validateConfirmation(password, confirmation)
    ) {
      return;
    }
    const normalized = normalizeEmail(email);
    const result = await run(() => api.signUp(normalized, password));
    // 登録済みメールでも同じ応答になる(列挙対策)ため、常に確認メールの案内へ進む
    if (result?.ok) router.replace({ pathname: '/account/verify-email', params: { email: normalized } });
  };

  return (
    <AuthScaffold
      title="メールで登録"
      onBack={() => router.back()}
      footer={
        <>
          <Button
            label={busy ? '送信中…' : 'アカウントを作成'}
            disabled={busy || !configured}
            onPress={() => void submit()}
          />
          <TextLink
            size="sm"
            prefix="アカウントをお持ちの方は"
            label="ログイン"
            onPress={() => router.replace('/account/login')}
          />
        </>
      }
    >
      <ScreenHeading
        title="メールアドレスで登録"
        description="確認のメールを送ります。届いたリンクを開いたあと、ログインしてください。"
      />
      <AuthInput
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        placeholder="taiki@example.com"
        editable={!busy}
      />
      <PasswordInput
        isNew
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        editable={!busy}
      />
      <PasswordRequirements password={password} email={email} />
      <PasswordInput
        isNew
        label="パスワード（確認）"
        value={confirmation}
        onChangeText={setConfirmation}
        error={confirmError}
        editable={!busy}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!configured ? <Notice tone="info">アカウント機能はこのビルドでは未設定です。</Notice> : null}
    </AuthScaffold>
  );
}
