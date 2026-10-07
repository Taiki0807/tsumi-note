import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, typography, useTheme } from '@/design';

import { TIMER_LIMITS, type TimerSettings } from './timer-logic';

type Props = {
  settings: TimerSettings;
  onChange: (next: TimerSettings) => void;
};

const ROWS: { key: keyof TimerSettings; label: string; unit: string }[] = [
  { key: 'focusMinutes', label: '集中時間', unit: '分' },
  { key: 'breakMinutes', label: '休憩時間', unit: '分' },
  { key: 'rounds', label: 'ラウンド数', unit: '' },
];

/** Settings are not designed in Figma yet (PRODUCT_SPEC: 未デザイン); built from existing tokens only. */
export function TimerSettingsPanel({ settings, onChange }: Props) {
  const colors = useTheme();

  return (
    <View style={{ gap: 8 }}>
      {ROWS.map(({ key, label, unit }) => {
        const { min, max } = TIMER_LIMITS[key];
        const step = (delta: number) => onChange({ ...settings, [key]: settings[key] + delta });
        return (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 56,
              paddingHorizontal: 16,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Text style={{ fontFamily: fontFamily.bold, ...typography.body, color: colors.textPrimary }}>
              {label}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <StepButton
                label={`${label}を減らす`}
                text="−"
                disabled={settings[key] <= min}
                onPress={() => step(-1)}
              />
              <Text
                style={{
                  minWidth: 52,
                  textAlign: 'center',
                  fontFamily: fontFamily.numeric,
                  ...typography.headingSm,
                  color: colors.textPrimary,
                }}
              >
                {settings[key]}
                {unit}
              </Text>
              <StepButton
                label={`${label}を増やす`}
                text="＋"
                disabled={settings[key] >= max}
                onPress={() => step(1)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StepButton({
  label,
  text,
  disabled,
  onPress,
}: {
  label: string;
  text: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.primary }}>{text}</Text>
    </Pressable>
  );
}
