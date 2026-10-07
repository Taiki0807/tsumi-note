import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';

/** Figma Chip: 28pt high pill, 12pt horizontal padding, 4pt gap, 16pt icon, Label 13/16 ExtraBold. */
export function Chip({
  label,
  icon,
  background,
  color,
  iconColor = color,
}: {
  label: string;
  icon: IconName;
  background: string;
  color: string;
  iconColor?: string;
}) {
  return (
    <View
      style={{
        height: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        borderRadius: radius.full,
        backgroundColor: background,
      }}
    >
      <Icon name={icon} size={16} color={iconColor} strokeWidth={1.8} />
      <Text numberOfLines={1} style={{ fontFamily: fontFamily.extraBold, ...typography.label, color }}>
        {label}
      </Text>
    </View>
  );
}

/** Figma ProgressBar: 8pt high, radius 4, gray-100 track with a primary fill. */
export function ProgressBar({ fraction }: { fraction: number }) {
  const colors = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      style={{ flex: 1, height: 8, borderRadius: radius.xs, backgroundColor: colors.surfaceMuted }}
    >
      <View
        style={{
          width: `${Math.min(1, Math.max(0, fraction)) * 100}%`,
          height: 8,
          borderRadius: radius.xs,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}
