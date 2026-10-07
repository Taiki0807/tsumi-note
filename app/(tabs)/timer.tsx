import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';
import { TimerRing } from '@/features/timer/timer-ring';
import { TimerSettingsPanel } from '@/features/timer/timer-settings-panel';
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
          onPress={() => setShowSettings((v) => !v)}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={3} stroke={colors.textPrimary} strokeWidth={2} fill="none" />
            <Path
              d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"
              stroke={colors.textPrimary}
              strokeWidth={2}
              strokeLinecap="round"
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
        {showSettings ? <TimerSettingsPanel settings={settings} onChange={timer.updateSettings} /> : null}

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
    </View>
  );
}
