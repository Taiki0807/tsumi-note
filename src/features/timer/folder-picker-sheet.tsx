import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { useSheetMotion } from '@/components/use-sheet-motion';
import { fontFamily, radius, shadow, typography, useTheme } from '@/design';

type Props = {
  visible: boolean;
  folders: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
};

/**
 * Folder picker for the timer (Figma 01 › Folder selector opens it). The Figma file has no frame for
 * the list itself, so it reuses the existing bottom-sheet motion and tokens. 「未分類」 = no folder.
 */
export function FolderPickerSheet({ visible, folders, selectedId, onSelect, onClose }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { mounted, panHandlers, backdropStyle, sheetStyle } = useSheetMotion({ visible, onClose });
  const options = [{ id: null, name: '未分類' }, ...folders];

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
            },
            backdropStyle,
          ]}
        >
          <Pressable accessibilityLabel="フォルダー選択を閉じる" onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          style={[
            {
              gap: 12,
              maxHeight: '70%',
              paddingTop: 8,
              paddingHorizontal: 24,
              paddingBottom: insets.bottom + 24,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              backgroundColor: colors.surface,
              ...shadow.card,
            },
            sheetStyle,
          ]}
        >
          <View {...panHandlers} style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </View>
          <Text
            style={{ fontFamily: fontFamily.extraBold, ...typography.headingSm, color: colors.textPrimary }}
          >
            フォルダーを選択
          </Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {options.map((option) => {
              const selected = option.id === selectedId;
              return (
                <Pressable
                  key={option.id ?? 'none'}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onSelect(option.id);
                    onClose();
                  }}
                  style={{
                    height: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 16,
                    borderRadius: radius.full,
                    backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                  }}
                >
                  <Icon name="folder" size={18} color={selected ? colors.primary : colors.textSecondary} />
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontFamily: fontFamily.extraBold,
                      fontSize: 15,
                      lineHeight: 24,
                      color: selected ? colors.primary : colors.textPrimary,
                    }}
                  >
                    {option.name}
                  </Text>
                  {selected && <Icon name="check" size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
