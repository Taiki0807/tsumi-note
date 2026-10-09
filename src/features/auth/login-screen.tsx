import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/form-ui';

import { useAuth } from './auth-context';
import {
  AuthInput,
  AuthScaffold,
  goHome,
  Notice,
  PasswordInput,
  ProviderButton,
  ScreenHeading,
  TextLink,
} from './auth-ui';
import { useSocialSignIn } from './use-social-sign-in';
import { useSubmit } from './use-submit';
import { normalizeEmail, validateEmail } from './validation';

/**
 * ログイン(Figma 未デザイン。既存トークン・Figma 14 のフォーム部品で構成)。
 * メール未確認のログインはAPIが拒否するため、確認メールの再送へ誘導する。ゲスト利用の継続導線も置く。
 */
export function LoginScreen() {
  const { api, configured } = useAuth();
  const { busy, error, run } = useSubmit();
  const social = useSocialSignIn();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    void social.checkApple().then(setAppleAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailError = touched ? validateEmail(email) : null;
  const passwordError = touched && password.length === 0 ? 'パスワードを入力してください。' : null;

  const submit = async () => {
    setTouched(true);
    if (validateEmail(email) || password.length === 0) return;
    setNeedsVerification(false);
    const result = await run(() => api.signIn(normalizeEmail(email), password));
    if (!result) return;
    if (result.ok) router.replace('/mypage');
    else if (result.kind === 'email_not_verified') setNeedsVerification(true);
  };

  const anyBusy = busy || social.busy !== null;

  return (
    <AuthScaffold
      title="ログイン"
      onBack={() => (router.canGoBack() ? router.back() : goHome())}
      footer={
        <>
          <Button
            label={busy ? 'ログイン中…' : 'ログイン'}
            disabled={anyBusy || !configured}
            onPress={() => void submit()}
          />
          <TextLink
            size="sm"
            prefix="アカウントをお持ちでない方は"
            label="新規作成"
            onPress={() => router.replace('/account/create')}
          />
          <TextLink size="sm" label="アカウントなしで利用を続ける" onPress={goHome} />
        </>
      }
    >
      <ScreenHeading
        title="おかえりなさい"
        description="ログインしても、この端末の学習データは削除されません。"
      />
      <AuthInput
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        editable={!anyBusy}
      />
      <PasswordInput value={password} onChangeText={setPassword} error={passwordError} editable={!anyBusy} />
      <TextLink
        size="sm"
        label="パスワードを忘れた場合"
        onPress={() => router.push('/account/forgot-password')}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {needsVerification ? (
        <TextLink
          size="sm"
          label="確認メールを再送する"
          onPress={() =>
            router.push({ pathname: '/account/verify-email', params: { email: normalizeEmail(email) } })
          }
        />
      ) : null}
      <View style={{ gap: 10 }}>
        <ProviderButton
          provider="apple"
          label="Appleで続ける"
          disabled={!configured || !appleAvailable || busy}
          busy={social.busy === 'apple'}
          onPress={() => void social.signIn('apple').then((ok) => ok && router.replace('/mypage'))}
        />
        <ProviderButton
          provider="google"
          label="Googleで続ける"
          disabled={!configured || !social.googleReady || busy}
          busy={social.busy === 'google'}
          onPress={() => void social.signIn('google').then((ok) => ok && router.replace('/mypage'))}
        />
      </View>
      {social.error ? <Notice tone="error">{social.error}</Notice> : null}
      {!configured ? (
        <Notice tone="info">
          アカウント機能はこのビルドでは未設定です。ゲストとして通常どおり利用できます。
        </Notice>
      ) : null}
    </AuthScaffold>
  );
}
