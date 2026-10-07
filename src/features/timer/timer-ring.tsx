import { Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { fontFamily, typography, useTheme } from '@/design';

import { formatRemaining, type TimerPhase } from './timer-logic';

// Figma 01 タイマー › Timer ring: 240 frame, 200 circle, 6 stroke, 16 knob (3 stroke).
const FRAME = 240;
const DIAMETER = 200;
const STROKE = 6;
const KNOB = 16;
const RADIUS = DIAMETER / 2;

// Figma › Minute ticks (204:541): 60 ticks, 6° apart, every 5th is a major tick. Ticks sit just
// outside the ring: outer radius 119; major 7 long / 2 wide / primaryMuted (#d4ccff), minor 5 long /
// 1.2 wide / border (#e0e0e0). Minor length is measured from rotated bounding boxes (~4.9), so it is approximate.
const TICK_COUNT = 60;
const TICK_OUTER = 119;
const TICKS = Array.from({ length: TICK_COUNT }, (_, i) => {
  const major = i % 5 === 0;
  const angle = (i / TICK_COUNT) * 2 * Math.PI - Math.PI / 2;
  const inner = TICK_OUTER - (major ? 7 : 5);
  return {
    major,
    x1: FRAME / 2 + inner * Math.cos(angle),
    y1: FRAME / 2 + inner * Math.sin(angle),
    x2: FRAME / 2 + TICK_OUTER * Math.cos(angle),
    y2: FRAME / 2 + TICK_OUTER * Math.sin(angle),
  };
});

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
        {TICKS.map((t, i) => (
          <Line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? colors.primaryMuted : colors.border}
            strokeWidth={t.major ? 2 : 1.2}
          />
        ))}
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
