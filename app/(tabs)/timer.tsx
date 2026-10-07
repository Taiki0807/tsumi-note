import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';
import { formatFocusMinutes } from '@/features/records/records-logic';
import { useTodayStats } from '@/features/records/use-today-stats';
import { TimerRing } from '@/features/timer/timer-ring';
import { TimerSettingsModal } from '@/features/timer/timer-settings-modal';
import { useTimer } from '@/features/timer/use-timer';

function StatCard({
  tone,
  label,
  value,
  icon,
}: {
  tone: 'success' | 'primary';
  label: string;
  value: string;
  icon: 'clock' | 'check';
}) {
  const colors = useTheme();
  const toneColor = tone === 'success' ? colors.success : colors.primary;
  const toneText = tone === 'success' ? colors.successText : colors.primary;
  const toneSoft = tone === 'success' ? colors.successSoft : colors.primarySoft;
  return (
    <View
      style={{
        flex: 1,
        height: 80,
        overflow: 'hidden',
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: toneColor,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: toneSoft }}>
        <Text style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: toneText }}>{label}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name={icon} size={20} color={toneColor} handsColor={colors.textPrimary} strokeWidth={1.83} />
        <Text style={{ fontFamily: fontFamily.numeric, fontSize: 18, lineHeight: 28, color: colors.textPrimary }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function TimerScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const today = useTodayStats(timer.savedCount);
  const [showSettings, setShowSettings] = useState(false);
  // `state.settings` is the session snapshot; `settings` is the editable value for the next start.
  const { state, settings } = timer;
  const { status } = state;

  const primary =
    status === 'running'
      ? { label: '一時停止', onPress: timer.onPause }
      : status === 'paused'
        ? { label: '再開', onPress: timer.onResume }
        : { label: status === 'completed' ? 'もう一度始める' : '集中を始める', onPress: timer.onStart };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* App bar (Figma 192:137): padding 12/16/8/24, gap 12, AppIcon 32 + title, 44 icon button. */}
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
        <Text className="flex-1 font-extrabold text-heading" style={{ color: colors.textPrimary }}>
          タイマー
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="タイマー設定"
          onPress={() => setShowSettings(true)}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="settings" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 24,
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
        }}
      >
        <View
          style={{
            marginTop: 16,
            alignItems: 'center',
            paddingVertical: 25,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.divider,
            backgroundColor: colors.surface,
            ...shadow.card,
          }}
        >
          <TimerRing remainingMs={timer.remainingMs} progress={timer.progress} phase={state.phase} />

          <View style={{ marginTop: 20, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
              ラウンド {state.round} / {state.settings.rounds}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: state.settings.rounds }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: i + 1 === state.round ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: i + 1 === state.round ? colors.primary : colors.primaryMuted,
                  }}
                />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={primary.onPress}
            style={{
              marginTop: 24,
              width: 300,
              maxWidth: '90%',
              height: 56,
              borderRadius: radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
              ...shadow.primary,
            }}
          >
            <Text style={{ fontFamily: fontFamily.bold, ...typography.button, color: colors.textOnPrimary }}>
              {primary.label}
            </Text>
          </Pressable>

          {status !== 'idle' ? (
            <Pressable
              accessibilityRole="button"
              onPress={timer.onReset}
              style={{ marginTop: 8, height: 44, justifyContent: 'center', paddingHorizontal: 16 }}
            >
              <Text
                style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}
              >
                リセット
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Today stats (Figma 192:126): two StatCards 165x80, gap 12, radius 12, 2pt tone border. */}
        <View style={{ marginTop: 16, flexDirection: 'row', gap: 12 }}>
          <StatCard tone="success" label="今日の集中" value={formatFocusMinutes(today.seconds)} icon="clock" />
          <StatCard tone="primary" label="完了" value={`${today.sessionCount}セッション`} icon="check" />
        </View>
      </ScrollView>

      <TimerSettingsModal
        visible={showSettings}
        settings={settings}
        onChange={timer.updateSettings}
        onClose={() => setShowSettings(false)}
      />
    </View>
  );
}
