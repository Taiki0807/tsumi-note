import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import {
  FOLDER_PALETTE,
  fontFamily,
  folderTone,
  typography,
  useTheme,
  useThemeName,
  type FolderColorKey,
} from '@/design';

type Props = {
  value: FolderColorKey;
  onChange: (key: FolderColorKey) => void;
};

/**
 * Folder color choice (folder create / edit sheet). Five swatches per row; each swatch is a ≥ 44pt tap
 * target. The selection is shown without relying on hue: a ring plus a check mark, and every color
 * carries its own symbol and name (also the accessibility label).
 */
export function FolderColorPicker({ value, onChange }: Props) {
  const colors = useTheme();
  const isDark = useThemeName() === 'dark';
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.textPrimary }}>
        フォルダーの色
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
        {FOLDER_PALETTE.map((entry) => {
          const selected = entry.key === value;
          const tone = folderTone(entry.key, colors, isDark);
          return (
            <Pressable
              key={entry.key}
              accessibilityRole="radio"
              accessibilityLabel={entry.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(entry.key)}
              style={{ width: '20%', alignItems: 'center', gap: 4 }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? colors.textPrimary : colors.border,
                  backgroundColor: tone.tile,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: tone.icon,
                  }}
                >
                  {selected ? (
                    <Icon name="check" size={18} color={colors.background} strokeWidth={3} />
                  ) : (
                    <Text
                      accessible={false}
                      style={{ fontSize: 14, lineHeight: 18, color: colors.background }}
                    >
                      {entry.symbol}
                    </Text>
                  )}
                </View>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: selected ? fontFamily.extraBold : fontFamily.bold,
                  fontSize: 11,
                  lineHeight: 14,
                  color: selected ? colors.textPrimary : colors.textSecondary,
                }}
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
