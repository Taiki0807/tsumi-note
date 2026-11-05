import { ColorPicker, Host } from '@expo/ui/swift-ui';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon } from '@/components/icons';
import {
  CUSTOM_COLOR_LABEL,
  FOLDER_PALETTE,
  fontFamily,
  folderTone,
  normalizeHexColor,
  typography,
  useTheme,
  useThemeName,
  type FolderColorValue,
} from '@/design';

type Props = {
  value: FolderColorValue;
  onChange: (key: FolderColorValue) => void;
};

const FALLBACK_PICKER_COLOR = '#7C5CFC';
/** Figma 12 › Swatch: 50pt cell, 40pt color circle; the selected cell gets a 2.5pt ring in its own color. */
const CELL = 50;
const DOT = 40;
const PER_ROW = 5;
/**
 * Figma 12 (node 197:515) › 色 › 「その他の色」: 50pt cell (no ring while unselected) > 40pt circle filled with an
 * ANGULAR gradient (start = 3 o'clock, clockwise; handles (0.5,0.5) (1,0.5) (0.5,1)) > 26pt center hole in the
 * surface color (variable 190:42). Stop positions are the Figma values.
 */
export const RAINBOW_STOPS: readonly { position: number; color: string }[] = [
  { position: 0, color: '#FF4D4D' },
  { position: 0.2, color: '#FFC400' },
  { position: 0.4, color: '#3DDC84' },
  { position: 0.6, color: '#1A96F0' },
  { position: 0.8, color: '#B44DFF' },
  { position: 1, color: '#FF4D4D' },
];
export const HOLE = 26;
/** Figma 423:1229 Icon/plus: 16pt box, 1.6pt stroke, centered in the 50pt cell (offset 0). Shown only while unselected. */
export const PLUS_SIZE = 16;
export const PLUS_STROKE = 1.6;
const RAINBOW_SEGMENTS = 120;

function lerpHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Color of the angular gradient at `position` (0..1) by linear interpolation between the Figma stops. */
export function rainbowColorAt(position: number): string {
  const p = Math.min(1, Math.max(0, position));
  for (let i = 1; i < RAINBOW_STOPS.length; i++) {
    const [prev, next] = [RAINBOW_STOPS[i - 1]!, RAINBOW_STOPS[i]!];
    if (p <= next.position) return lerpHex(prev.color, next.color, (p - prev.position) / (next.position - prev.position));
  }
  return RAINBOW_STOPS[RAINBOW_STOPS.length - 1]!.color;
}

/** Thin pie slices (clockwise from 3 o'clock) approximating the angular gradient with react-native-svg. */
function RainbowCircle({ holeColor }: { holeColor: string }) {
  const r = DOT / 2;
  const slices = Array.from({ length: RAINBOW_SEGMENTS }, (_, i) => {
    const a0 = (i / RAINBOW_SEGMENTS) * 2 * Math.PI;
    // Overlap each slice slightly into the next one so no seam shows.
    const a1 = ((i + 1.5) / RAINBOW_SEGMENTS) * 2 * Math.PI;
    const point = (a: number) => `${(r + r * Math.cos(a)).toFixed(3)} ${(r + r * Math.sin(a)).toFixed(3)}`;
    return (
      <Path
        key={i}
        d={`M${r} ${r} L${point(a0)} A${r} ${r} 0 0 1 ${point(a1)} Z`}
        fill={rainbowColorAt((i + 0.5) / RAINBOW_SEGMENTS)}
      />
    );
  });
  return (
    <Svg width={DOT} height={DOT} viewBox={`0 0 ${DOT} ${DOT}`} testID="rainbow-circle">
      {slices}
      <Circle cx={r} cy={r} r={HOLE / 2} fill={holeColor} />
    </Svg>
  );
}

/**
 * Folder color choice (folder create / edit sheet), Figma 12 › 色: label 「色」, two rows of five 50pt
 * swatches spread across the width (12pt between rows). The selection is the colored ring; each swatch
 * keeps its name as the accessibility label (the name is also shown in the sheet's preview).
 */
export function FolderColorPicker({ value, onChange }: Props) {
  const colors = useTheme();
  const isDark = useThemeName() === 'dark';
  const cells: ('custom' | (typeof FOLDER_PALETTE)[number])[] = [...FOLDER_PALETTE];
  if (Platform.OS === 'ios') cells.push('custom');
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += PER_ROW) rows.push(cells.slice(i, i + PER_ROW));
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.textPrimary }}>色</Text>
      <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {row.map((entry) =>
              entry === 'custom' ? (
                <CustomColorCell key="custom" value={value} onChange={onChange} />
              ) : (
                <Pressable
                  key={entry.key}
                  accessibilityRole="radio"
                  accessibilityLabel={entry.label}
                  accessibilityState={{ selected: entry.key === value }}
                  onPress={() => onChange(entry.key)}
                >
                  <Swatch color={folderTone(entry.key, colors, isDark).icon} selected={entry.key === value} />
                </Pressable>
              ),
            )}
            {/* Keeps a short last row aligned to the grid. */}
            {Array.from({ length: PER_ROW - row.length }, (_, i) => (
              <View key={`pad${i}`} style={{ width: CELL, height: CELL }} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Swatch({ color, selected }: { color: string; selected: boolean }) {
  return (
    <View
      style={{
        width: CELL,
        height: CELL,
        borderRadius: CELL / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: selected ? 2.5 : 0,
        borderColor: color,
      }}
    >
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }} />
    </View>
  );
}

/**
 * 「その他の色」: drawn in React Native; the iOS standard `ColorPicker` (SwiftUI, no opacity) sits
 * invisibly on top and receives the tap that opens the system picker. Selected: filled with the chosen color.
 */
function CustomColorCell({ value, onChange }: Props) {
  const colors = useTheme();
  const isDark = useThemeName() === 'dark';
  const custom = normalizeHexColor(value);
  const tone = folderTone(value, colors, isDark);
  return (
    <View
      accessible
      accessibilityRole="radio"
      accessibilityLabel={`その他の色（${CUSTOM_COLOR_LABEL}）`}
      accessibilityHint="タップするとカラーピッカーが開きます"
      accessibilityState={{ selected: custom !== null }}
      style={{ width: CELL, height: CELL }}
    >
      {custom ? (
        <Swatch color={tone.icon} selected />
      ) : (
        <View style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}>
          <RainbowCircle holeColor={colors.surface} />
          {/* Figma 423:1229 Icon/plus: 16pt box centered in the cell, 1.6pt round stroke (= 2.4 in the 24 viewBox), variable 190:46 (textPrimary). */}
          <View style={{ position: 'absolute' }} testID="rainbow-plus">
            <Icon name="plus" size={PLUS_SIZE} color={colors.textPrimary} strokeWidth={PLUS_STROKE * (24 / PLUS_SIZE)} />
          </View>
        </View>
      )}
      <View style={{ position: 'absolute', width: CELL, height: CELL, opacity: 0.02 }}>
        <Host style={{ width: CELL, height: CELL }}>
          <ColorPicker
            selection={custom ?? normalizeHexColor(tone.icon) ?? FALLBACK_PICKER_COLOR}
            supportsOpacity={false}
            onSelectionChange={(hex) => {
              const next = normalizeHexColor(hex.slice(0, 7));
              if (next) onChange(next);
            }}
          />
        </Host>
      </View>
    </View>
  );
}
