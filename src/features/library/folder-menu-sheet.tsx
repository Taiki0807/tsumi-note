import { Pressable, Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components/form-ui';
import { Icon, type IconName } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';

function MenuItem({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  const color = danger ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 18,
        borderRadius: radius.lg,
        backgroundColor: danger ? colors.dangerSoft : colors.surfaceMuted,
      }}
    >
      <Icon name={icon} size={22} color={color} strokeWidth={2} />
      <Text style={{ fontFamily: fontFamily.bold, ...typography.button, color }}>{label}</Text>
    </Pressable>
  );
}

/** Figma 08b フォルダーのメニュー: folder name, 名前を変更 / 削除 rows, キャンセル. */
export function FolderMenuSheet({
  visible,
  folderName,
  onRename,
  onDelete,
  onClose,
}: {
  visible: boolean;
  folderName: string;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} gap={16}>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.heading,
          lineHeight: 30,
          color: colors.textPrimary,
        }}
      >
        {folderName}
      </Text>
      <View style={{ gap: 8 }}>
        <MenuItem icon="edit" label="フォルダー名を変更" onPress={onRename} />
        <MenuItem icon="trash" label="フォルダーを削除" danger onPress={onDelete} />
      </View>
      <Button label="キャンセル" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
