import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { fontFamily, typography, useTheme } from '@/design';

import { formatRemaining, type TimerPhase } from './timer-logic';

// Figma 01 タイマー › Timer ring: 240 frame, 200 circle, 6 stroke, 16 knob (3 stroke).
const FRAME = 240;
const DIAMETER = 200;
const STROKE = 6;
const KNOB = 16;
const RADIUS = DIAMETER / 2;

type Props = {
  remainingMs: number;
  progress: number;
  phase: TimerPhase;
};

export function TimerRing({ remainingMs, progress, phase }: Props) {
  const colors = useTheme();
  const center = FRAME / 2;
  const circumference = 2 * Math.PI * (RADIUS - STROKE / 2);
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const knobX = center + RADIUS * Math.cos(angle);
  const knobY = center + RADIUS * Math.sin(angle);

  return (
    <View style={{ width: FRAME, height: FRAME, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={FRAME} height={FRAME} style={{ position: 'absolute' }} accessibilityElementsHidden>
        <Circle
          cx={center}
          cy={center}
          r={RADIUS - STROKE / 2}
          stroke={colors.primarySoft}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={RADIUS - STROKE / 2}
          stroke={colors.primary}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
        <Circle
          cx={knobX}
          cy={knobY}
          r={(KNOB - 3) / 2 + 1.5}
          fill={colors.surface}
          stroke={colors.primary}
          strokeWidth={3}
        />
      </Svg>
      <Text
        accessibilityRole="timer"
        style={{
          fontFamily: fontFamily.numeric,
          fontSize: typography.timer.fontSize,
          lineHeight: typography.timer.lineHeight,
          color: colors.textPrimary,
        }}
      >
        {formatRemaining(remainingMs)}
      </Text>
      <View
        style={{
          marginTop: 6,
          height: 28,
          paddingHorizontal: 16,
          borderRadius: 100,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: phase === 'focus' ? colors.primarySoft : colors.successSoft,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.bold,
            fontSize: typography.label.fontSize,
            color: phase === 'focus' ? colors.primary : colors.successText,
          }}
        >
          {phase === 'focus' ? '集中' : '休憩'}
        </Text>
      </View>
    </View>
  );
}
