import { useRef } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components/form-ui';
import { fontFamily, typography, useTheme } from '@/design';
import { MenuItem } from '@/features/library/folder-menu-sheet';

type Props = {
  visible: boolean;
  title: string;
  pinned: boolean;
  /** Absent for a note that is not saved yet (nothing to pin). */
  onTogglePin?: () => void;
  /** 「科目を変更」: only the editor offers it (not in Figma; kept from the previous menu). */
  onChangeFolder?: () => void;
  onDelete: () => void;
  onClose: () => void;
};

/**
 * Figma 03b ノートのメニュー: note title, ピン留め / ノートを削除 rows, キャンセル. Shared by the list and
 * the editor. Every choice runs only after the sheet has fully closed, so the follow-up sheet (削除の確認 /
 * 科目の選択) can open: iOS ignores a Modal presented while another one is still dismissing.
 */
export function NoteMenuSheet({
  visible,
  title,
  pinned,
  onTogglePin,
  onChangeFolder,
  onDelete,
  onClose,
}: Props) {
  const colors = useTheme();
  const pending = useRef<(() => void) | null>(null);
  const choose = (action: () => void) => {
    pending.current = action;
    onClose();
  };
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      gap={16}
      onDismissed={() => {
        const action = pending.current;
        pending.current = null;
        action?.();
      }}
    >
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
        {title}
      </Text>
      <View style={{ gap: 8 }}>
        {onTogglePin && (
          <MenuItem
            icon="pin"
            label={pinned ? 'ピン留めを解除' : 'ピン留め'}
            onPress={() => choose(onTogglePin)}
          />
        )}
        {onChangeFolder && (
          <MenuItem icon="folder" label="科目を変更" onPress={() => choose(onChangeFolder)} />
        )}
        <MenuItem icon="trash" label="ノートを削除" danger onPress={() => choose(onDelete)} />
      </View>
      <Button label="キャンセル" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
