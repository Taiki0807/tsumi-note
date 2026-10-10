import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { fontFamily, typography, useTheme } from '@/design';
import { TextLink } from '@/features/auth/auth-ui';

/** ゲスト利用中の説明。ログインしなくても全機能を使え、ログイン時の引き継ぎは選べることを伝える(未デザイン) */
export function GuestAccountHint({ configured }: { configured: boolean }) {
  const colors = useTheme();
  return (
    <View style={{ gap: 6, paddingHorizontal: 4 }}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.textPrimary }}>
        ゲストとして利用中です
      </Text>
      <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
        記録・ノート・復習はこの端末に保存されています。アカウントがなくても、すべての機能を使えます。
        {configured
          ? 'ログインするときは、この端末の記録を引き継ぐかどうかを選べます(ゲストの記録は削除されません)。'
          : ''}
      </Text>
      {configured ? (
        <TextLink
          size="sm"
          prefix="アカウントをお持ちの方は"
          label="ログイン"
          onPress={() => router.push('/account/login')}
        />
      ) : null}
    </View>
  );
}
