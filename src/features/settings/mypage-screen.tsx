import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Icon, type IconName } from '@/components/icons';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';
import { splitDuration } from '@/features/records/records-logic';

import { useMyPage } from './use-settings';

/** Figma Row/…: 44pt icon tile (radius 20 → circle), title 15/24 ExtraBold, subtitle 13/16 Bold. */
function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySoft,
        }}
      >
        <Icon name={icon} size={20} color={colors.primary} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.textSecondary }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? <Icon name="chevron-right" size={20} color={colors.textSecondary} strokeWidth={2.2} />}
    </Pressable>
  );
}

function formatStudyTime(seconds: number): string {
  const { hours, minutes } = splitDuration(seconds);
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

/** Figma 15 マイページ（未登録）. Account creation belongs to Phase 8, so its button is inert. */
export function MyPageScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const systemDark = useColorScheme() === 'dark';
  const { summary, setDarkMode } = useMyPage();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 24,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <AppIcon size={32} cornerRadius={8 * (200 / 32)} />
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            ...typography.heading,
            color: colors.textPrimary,
          }}
        >
          マイページ
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: 24,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
      >
        {summary ? (
          <>
            <View style={{ gap: 12, padding: 18, borderRadius: 20, backgroundColor: colors.primarySoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.xl,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.primary,
                  }}
                >
                  <Icon name="user" size={22} color={colors.textOnPrimary} strokeWidth={2.2} />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontFamily: fontFamily.extraBold,
                    ...typography.headingSm,
                    color: colors.textPrimary,
                  }}
                >
                  アカウントを作成して同期
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: fontFamily.bold,
                  ...typography.label,
                  lineHeight: 20,
                  color: colors.textSecondary,
                }}
              >
                ノート{summary.noteCount}件・問題{summary.questionCount}問・学習時間{' '}
                {formatStudyTime(summary.studySeconds)}を、iPhone と iPad のどちらでも使えます。
              </Text>
              {/* Phase 8 (Account / Sync): no auth is implemented yet, so the button stays disabled. */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={{
                  height: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.full,
                  backgroundColor: colors.primary,
                  opacity: 0.4,
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamily.extraBold,
                    ...typography.body,
                    lineHeight: 22,
                    color: colors.textOnPrimary,
                  }}
                >
                  アカウントを作成
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/goal')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.divider,
                backgroundColor: colors.surface,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Icon name="target" size={22} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
                >
                  目標
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamily.extraBold,
                    fontSize: 17,
                    lineHeight: 24,
                    color: colors.textPrimary,
                  }}
                >
                  {summary.goal ? summary.goal.title : '目標を設定する'}
                </Text>
              </View>
              {summary.goal && summary.goal.daysRemaining !== null && summary.goal.daysRemaining >= 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <Text
                    style={{
                      fontFamily: fontFamily.bold,
                      ...typography.caption,
                      color: colors.textSecondary,
                    }}
                  >
                    あと
                  </Text>
                  <Text
                    style={{
                      fontFamily: fontFamily.numeric,
                      fontSize: 22,
                      lineHeight: 26,
                      color: colors.primary,
                    }}
                  >
                    {summary.goal.daysRemaining}
                  </Text>
                  <Text
                    style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}
                  >
                    日
                  </Text>
                </View>
              ) : null}
              <Icon name="chevron-right" size={20} color={colors.textSecondary} strokeWidth={2.2} />
            </Pressable>

            <View style={{ gap: 2 }}>
              <Text
                style={{
                  fontFamily: fontFamily.extraBold,
                  ...typography.caption,
                  color: colors.textSecondary,
                }}
              >
                設定
              </Text>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 4,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  backgroundColor: colors.surface,
                }}
              >
                <SettingsRow
                  icon="clock"
                  title="タイマー"
                  subtitle={summary.timerSummary}
                  onPress={() => router.navigate('/timer')}
                />
                <SettingsRow
                  icon="cards"
                  title="復習"
                  subtitle={summary.reviewSummary}
                  onPress={() => router.push('/review/settings')}
                />
                <SettingsRow
                  icon="bell"
                  title="通知"
                  subtitle={summary.reminderSummary}
                  onPress={() => router.push('/settings/notifications')}
                />
                <SettingsRow
                  icon="moon"
                  title="ダークモード"
                  trailing={
                    <Switch
                      accessibilityLabel="ダークモード"
                      value={summary.darkMode ?? systemDark}
                      onValueChange={setDarkMode}
                      trackColor={{ true: colors.primary, false: colors.border }}
                    />
                  }
                />
                <SettingsRow
                  icon="shield"
                  title="プライバシーとデータ"
                  onPress={() => router.push('/settings/privacy')}
                />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
