import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { syncBadge, type SyncTone } from '@/sync/describe';
import type { SyncStatus } from '@/sync/controller';

type Props = {
  email: string;
  sync: { status: SyncStatus; pending: number; conflicts: number };
};

/**
 * Figma 16 マイページ(登録済み)の Account カード: 16pt radius・padding 16・gap 14、
 * 56pt のアバター(22 ExtraBold)・メール(18 ExtraBold)・chevron、その下に Sync status(radius 12・padding 12/10・gap 8)。
 * タップで Figma 17 のアカウント画面へ遷移する。
 */
export function AccountSummary({ email, sync }: Props) {
  const colors = useTheme();
  const badge = syncBadge(sync);
  const tone: Record<SyncTone, { fg: string; bg: string }> = {
    ok: { fg: colors.successText, bg: colors.successSoft },
    busy: { fg: colors.primary, bg: colors.primarySoft },
    warn: { fg: colors.warningText, bg: colors.warningSoft },
    error: { fg: colors.danger, bg: colors.dangerSoft },
  };
  const initial = (email.trim()[0] ?? '?').toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`アカウント ${email}、${badge.label}`}
      onPress={() => router.push('/account')}
      style={{
        gap: 14,
        padding: 16,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text
            style={{ fontFamily: fontFamily.extraBold, fontSize: 22, lineHeight: 28, color: colors.primary }}
          >
            {initial}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            fontSize: 18,
            lineHeight: 24,
            color: colors.textPrimary,
          }}
        >
          {email}
        </Text>
        <Icon name="chevron-right" size={18} color={colors.textSecondary} strokeWidth={2.2} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: tone[badge.tone].bg,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone[badge.tone].fg }} />
        <Text
          accessibilityRole="text"
          style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: tone[badge.tone].fg }}
        >
          {badge.label}
        </Text>
      </View>
    </Pressable>
  );
}
