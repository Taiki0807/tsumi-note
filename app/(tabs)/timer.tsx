import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Icon } from '@/components/icons';
import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';
import { TimerRing } from '@/features/timer/timer-ring';
import { TimerSettingsModal } from '@/features/timer/timer-settings-modal';
import { useTimer } from '@/features/timer/use-timer';

export default function TimerScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
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
