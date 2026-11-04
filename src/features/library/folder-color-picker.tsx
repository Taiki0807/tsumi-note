import { ColorPicker, Host } from '@expo/ui/swift-ui';
import { Platform, Pressable, Text, View } from 'react-native';

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
/** Figma 「その他の色」 is an angular rainbow; approximated with a ring of dots (no gradient dependency). */
const RAINBOW = ['#ff4d4d', '#ffc400', '#3ddc84', '#1a96f0', '#b44dff', '#ff4d4d'];

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
          <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, overflow: 'hidden' }}>
            {RAINBOW.slice(0, 5).map((c, i) => {
              const angle = (i / 5) * 2 * Math.PI;
              return (
                <View
                  key={c + i}
                  style={{
                    position: 'absolute',
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: c,
                    left: DOT / 2 - 7 + Math.sin(angle) * 12,
                    top: DOT / 2 - 7 - Math.cos(angle) * 12,
                  }}
                />
              );
            })}
            <View
              style={{
                position: 'absolute',
                left: 13,
                top: 13,
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: colors.surface,
              }}
            />
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
