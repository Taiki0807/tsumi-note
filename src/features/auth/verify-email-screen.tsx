import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/form-ui';
import { fontFamily, typography, useTheme } from '@/design';

import { useAuth } from './auth-context';
import { AuthScaffold, goHome, Notice, ScreenHeading, TextLink } from './auth-ui';
import { useSubmit } from './use-submit';
import { validateEmail } from './validation';

/** APIの再送制限(1分1回)に合わせた待ち時間(秒) */
export const RESEND_COOLDOWN_SECONDS = 60;

/** メール確認の案内(Figma 未デザイン)。確認後は自動ログインせず、ログイン画面へ進む */
export function VerifyEmailScreen() {
  const colors = useTheme();
  const { api } = useAuth();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const email = typeof emailParam === 'string' && validateEmail(emailParam) === null ? emailParam : null;
  const { busy, error, run } = useSubmit();
  const [sent, setSent] = useState(false);
  // 登録・ログイン直後に確認メールが送られているので、最初から待ち時間を設ける
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (!email || cooldown > 0) return;
    const result = await run(() => api.resendVerification(email));
    if (result?.ok) {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else if (result && !result.ok && result.kind === 'rate_limited') {
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  };

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
        title="確認メールを送信しました"
        description={
          email
            ? `${email} に届いたメールのリンクを開いてください。リンクの有効期限は1時間です。`
            : '届いたメールのリンクを開いてください。リンクの有効期限は1時間です。'
        }
      />
      <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
        確認が完了したら、ログインしてください。メールが届かない場合は、迷惑メールフォルダーを確認するか、再送信してください。
      </Text>
      {sent ? <Notice tone="success">確認メールを再送信しました。</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {email ? (
        <Button
          variant="secondary"
          label={busy ? '送信中…' : cooldown > 0 ? `再送信（${cooldown}秒後）` : '確認メールを再送信'}
          disabled={busy || cooldown > 0}
          onPress={() => void resend()}
        />
      ) : null}
    </AuthScaffold>
  );
}
