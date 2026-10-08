import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/form-ui';
import { fontFamily, radius, typography, useTheme } from '@/design';

import { useAuth } from './auth-context';
import { Notice } from './auth-ui';
import { useSubmit } from './use-submit';

/**
 * ログイン中の暫定カード(Figma 16 マイページ（登録済み）は PR 6 で実装するため、現時点では未適用)。
 * 既存トークンのみで構成。ログアウトしても端末の学習データ(ゲストDB)には触れない。
 * アカウント別DBへの切替と同期は PR 3 以降のため、ここではまだデータはクラウドに保存されない。
 */
export function SignedInCard({ email }: { email: string }) {
  const colors = useTheme();
  const { api } = useAuth();
  const { busy, error, run } = useSubmit();
  const [done, setDone] = useState(false);

  return (
    <View
      style={{
        gap: 12,
        padding: 18,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: colors.textSecondary }}>
        アカウント
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}
      >
        {email}
      </Text>
      <Notice tone="info">
        ログイン中です。端末間の同期とデータの引き継ぎは今後のアップデートで有効になります。この端末の学習データは削除されません。
      </Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        label={busy ? 'ログアウト中…' : 'ログアウト'}
        disabled={busy || done}
        onPress={() => void run(() => api.signOut()).then((r) => r?.ok && setDone(true))}
      />
    </View>
  );
}
