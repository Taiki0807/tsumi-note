import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button } from '@/components/form-ui';

import { useAuth } from './auth-context';
import { AuthInput, AuthScaffold, Notice, ScreenHeading, TextLink } from './auth-ui';
import { useSubmit } from './use-submit';
import { normalizeEmail, validateEmail } from './validation';

const RESEND_COOLDOWN_SECONDS = 60;

/** パスワード再設定メールの依頼(Figma 未デザイン)。登録の有無は応答から分からない */
export function ForgotPasswordScreen() {
  const { api, configured } = useAuth();
  const { busy, error, run } = useSubmit();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const emailError = touched ? validateEmail(email) : null;

  const submit = async () => {
    setTouched(true);
    if (validateEmail(email) || cooldown > 0) return;
    const result = await run(() => api.requestPasswordReset(normalizeEmail(email)));
    if (result?.ok || (result && !result.ok && result.kind === 'rate_limited'))
      setCooldown(RESEND_COOLDOWN_SECONDS);
    if (result?.ok) setSent(true);
  };

  return (
    <AuthScaffold
      title="パスワードの再設定"
      onBack={() => router.back()}
      footer={
        <>
          <Button
            label={
              busy
                ? '送信中…'
                : cooldown > 0
                  ? `再送信（${cooldown}秒後）`
                  : sent
                    ? '再送信'
                    : '再設定メールを送信'
            }
            disabled={busy || cooldown > 0 || !configured}
            onPress={() => void submit()}
          />
          <TextLink size="sm" label="ログインに戻る" onPress={() => router.replace('/account/login')} />
        </>
      }
    >
      <ScreenHeading
        title="パスワードを忘れた場合"
        description="登録したメールアドレスを入力してください。再設定用のリンクを送ります。"
      />
      <AuthInput
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        editable={!busy}
      />
      {sent ? (
        <Notice tone="success">
          登録されているメールアドレスの場合、再設定用のメールを送信しました。リンクの有効期限は1時間です。
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </AuthScaffold>
  );
}
