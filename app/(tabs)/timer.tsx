import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';
import { TimerRing } from '@/features/timer/timer-ring';
import { TimerSettingsModal } from '@/features/timer/timer-settings-modal';
import { useTimer } from '@/features/timer/use-timer';

export default function TimerScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const [showSettings, setShowSettings] = useState(false);
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
      <View className="h-16 flex-row items-center justify-between px-6">
        <Text className="font-extrabold text-heading" style={{ color: colors.textPrimary }}>
          タイマー
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="タイマー設定"
          onPress={() => setShowSettings(true)}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={3} stroke={colors.textPrimary} strokeWidth={2} fill="none" />
            <Path
              d="M12 2.5l1.6 2.4 2.8-.6.9 2.7 2.7.9-.6 2.8 2.4 1.6-2.4 1.6.6 2.8-2.7.9-.9 2.7-2.8-.6-1.6 2.4-1.6-2.4-2.8.6-.9-2.7-2.7-.9.6-2.8L2.2 12l2.4-1.6-.6-2.8 2.7-.9.9-2.7 2.8.6z"
              stroke={colors.textPrimary}
              strokeWidth={1.6}
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
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
              ラウンド {state.round} / {settings.rounds}
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
