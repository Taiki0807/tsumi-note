import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, typography, useTheme } from '@/design';
import { useFolderTone } from '@/features/notes/folder-tone';

type Props = {
  visible: boolean;
  folders: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
  /**
   * Shows the 「新しいフォルダーを作成」 row. The picker closes itself and calls this only after its Modal has
   * unmounted: iOS ignores a Modal presented while another is still dismissing.
   */
  onCreate?: () => void;
  /** Defaults to the timer's wording (Figma 01b). */
  title?: string;
  subtitle?: string | null;
};

function FolderRow({
  name,
  index,
  selected,
  first,
  onPress,
}: {
  name: string;
  /** Position among the folders; -1 = 未分類. */
  index: number;
  selected: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  const tone = useFolderTone(index);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.divider,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone.tile,
        }}
      >
        <Icon name="folder" size={22} color={tone.icon} strokeWidth={2} />
      </View>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: fontFamily.extraBold,
          fontSize: 16,
          lineHeight: 24,
          color: colors.textPrimary,
        }}
      >
        {name}
      </Text>
      {selected && (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
          }}
        >
          <Icon name="check" size={14} color={colors.textOnPrimary} strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Figma 01b フォルダーを選択: title + hint, folder rows (44pt tinted tile, check badge on the selection) and
 * the 「新しいフォルダーを作成」 row. 「未分類」 = no folder (not drawn in Figma; kept so a record can stay
 * folder-less).
 */
export function FolderPickerSheet({
  visible,
  folders,
  selectedId,
  onSelect,
  onClose,
  onCreate,
  title = '学習するフォルダー',
  subtitle = 'タイマーの時間は、選んだフォルダーに記録されます',
}: Props) {
  const colors = useTheme();
  const createPending = useRef(false);
  const options = [{ id: null as string | null, name: '未分類' }, ...folders];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      gap={18}
      onDismissed={() => {
        if (!createPending.current) return;
        createPending.current = false;
        onCreate?.();
      }}
    >
      <View style={{ gap: 4 }}>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.extraBold,
            ...typography.heading,
            lineHeight: 33,
            color: colors.textPrimary,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.textSecondary }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View>
        {options.map((option, i) => (
          <FolderRow
            key={option.id ?? 'none'}
            name={option.name}
            index={option.id === null ? -1 : folders.findIndex((f) => f.id === option.id)}
            selected={option.id === selectedId}
            first={i === 0}
            onPress={() => {
              onSelect(option.id);
              onClose();
            }}
          />
        ))}
      </View>
      {onCreate && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新しいフォルダーを作成"
          onPress={() => {
            createPending.current = true;
            onClose();
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingVertical: 12,
            paddingLeft: 12,
            paddingRight: 16,
            borderRadius: 20,
            backgroundColor: colors.primarySoft,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
            }}
          >
            <Icon name="plus" size={22} color={colors.textOnPrimary} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontFamily: fontFamily.extraBold,
                fontSize: 16,
                lineHeight: 24,
                color: colors.primary,
              }}
            >
              新しいフォルダーを作成
            </Text>
            <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.primary }}>
              科目や資格ごとに分けて記録できます
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.primary} strokeWidth={2.2} />
        </Pressable>
      )}
    </BottomSheet>
  );
}
