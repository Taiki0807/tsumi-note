import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Icon, type IconName } from '@/components/icons';
import { fontFamily, layout, lightColors, radius, typography, useTheme } from '@/design';
import { splitDuration } from '@/features/records/records-logic';
import { TimerSettingsModal } from '@/features/timer/timer-settings-modal';

import { describeTimerSettings } from './settings-use-cases';
import { useMyPage, useTimerSettings } from './use-settings';

type RowTone = 'primary' | 'warning' | 'danger' | 'info' | 'success';

/**
 * Figma Row/…: 56pt row (10pt vertical padding, 12pt gap), 36pt circular icon tile with a 20pt icon in
 * the tone's color on its soft background, title 15/24 ExtraBold, value 13/16 Bold, 18pt chevron.
 * Rows after the first have a 1pt top divider.
 */
function SettingsRow({
  icon,
  tone,
  title,
  value,
  first,
  onPress,
  trailing,
}: {
  icon: IconName;
  tone: RowTone;
  title: string;
  value?: string;
  first?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const colors = useTheme();
  const palette = {
    primary: { bg: colors.primarySoft, fg: colors.primary },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.dangerAccent },
    info: { bg: colors.infoSoft, fg: colors.info },
    success: { bg: colors.successSoft, fg: colors.success },
  }[tone];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${title}、${value}` : title}
      disabled={!onPress}
      onPress={onPress}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.divider,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.bg,
        }}
      >
        <Icon name={icon} size={20} color={palette.fg} strokeWidth={2} />
      </View>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}
      >
        {title}
      </Text>
      {value ? (
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            fontFamily: fontFamily.bold,
            ...typography.label,
            color: colors.textSecondary,
          }}
        >
          {value}
        </Text>
      ) : null}
      {trailing ?? <Icon name="chevron-right" size={18} color={colors.textSecondary} strokeWidth={2.2} />}
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
  const timer = useTimerSettings();
  const [timerSheet, setTimerSheet] = useState(false);

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
            {/* Figma Sync prompt: primary card, 20pt radius, 18pt padding, white content. */}
            <View style={{ gap: 12, padding: 18, borderRadius: 20, backgroundColor: colors.primary }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  <Icon name="user" size={22} color={colors.textOnPrimary} strokeWidth={2} />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontFamily: fontFamily.extraBold,
                    ...typography.headingSm,
                    color: colors.textOnPrimary,
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
                  color: colors.textOnPrimary,
                }}
              >
                ノート{summary.noteCount}件・問題{summary.questionCount}問・学習時間{' '}
                {formatStudyTime(summary.studySeconds)}を、iPhone と iPad のどちらでも使えます。
              </Text>
              {/* Figma Button/アカウントを作成: white fill and primary text in both themes (fixed Figma values), 44pt, full radius. Phase 8 (Account / Sync): no auth yet, so it stays inert. */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                disabled
                style={{
                  height: 44,
                  alignSelf: 'flex-start',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                  borderRadius: radius.full,
                  backgroundColor: lightColors.surface,
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamily.extraBold,
                    ...typography.body,
                    lineHeight: 22,
                    color: lightColors.primary,
                  }}
                >
                  アカウントを作成
                </Text>
              </Pressable>
            </View>

            {/* Figma Goal link: 16pt padding, 44pt radius-12 tile with a 22pt target icon. */}
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
                <Icon name="target" size={22} color={colors.primary} strokeWidth={2.5} />
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
                    style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
                  >
                    あと
                  </Text>
                  <Text
                    style={{ fontFamily: fontFamily.numeric, fontSize: 22, lineHeight: 26, color: colors.primary }}
                  >
                    {summary.goal.daysRemaining}
                  </Text>
                  <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}>
                    日
                  </Text>
                </View>
              ) : null}
              <Icon name="chevron-right" size={18} color={colors.textSecondary} strokeWidth={2.2} />
            </Pressable>

            {/* Figma Settings: card with a 設定 caption (padding 16/14/16/4) and five rows. */}
            <View
              style={{
                paddingLeft: 16,
                paddingTop: 14,
                paddingRight: 16,
                paddingBottom: 4,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.divider,
                backgroundColor: colors.surface,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: colors.textSecondary }}
              >
                設定
              </Text>
              <SettingsRow
                first
                icon="clock"
                tone="primary"
                title="タイマー"
                value={describeTimerSettings(timer.settings)}
                onPress={() => setTimerSheet(true)}
              />
              <SettingsRow
                icon="cards"
                tone="warning"
                title="復習"
                value={summary.reviewSummary}
                onPress={() => router.push('/review/settings')}
              />
              <SettingsRow
                icon="bell"
                tone="danger"
                title="通知"
                value={summary.reminderSummary}
                onPress={() => router.push('/settings/notifications')}
              />
              <SettingsRow
                icon="moon"
                tone="info"
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
                tone="success"
                title="プライバシーとデータ"
                onPress={() => router.push('/settings/privacy')}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* The timer tab's own settings sheet: same component, same storage (next session onward). */}
      <TimerSettingsModal
        visible={timerSheet}
        settings={timer.settings}
        onChange={timer.update}
        onClose={() => setTimerSheet(false)}
      />
    </View>
  );
}
