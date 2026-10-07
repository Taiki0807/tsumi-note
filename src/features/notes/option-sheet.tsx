import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { useSheetMotion } from '@/components/use-sheet-motion';
import { fontFamily, radius, shadow, typography, useTheme } from '@/design';

export type SheetOption = { key: string; label: string; icon?: IconName; selected?: boolean };

type Props = {
  visible: boolean;
  title: string;
  options: SheetOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
};

/**
 * Editor toolbar menu (block types, heading levels, …). Figma 04 has no frame for it, so it reuses
 * the folder picker's bottom-sheet motion and the same row style / tokens.
 */
export function OptionSheet({ visible, title, options, onSelect, onClose }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { mounted, panHandlers, backdropStyle, sheetStyle } = useSheetMotion({ visible, onClose });

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
          <Pressable accessibilityLabel={`${title}を閉じる`} onPress={onClose} style={{ flex: 1 }} />
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
            {title}
          </Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {options.map((option) => (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected: option.selected === true }}
                onPress={() => {
                  onSelect(option.key);
                  onClose();
                }}
                style={{
                  height: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 16,
                  borderRadius: radius.full,
                  backgroundColor: option.selected ? colors.primarySoft : colors.surfaceMuted,
                }}
              >
                {option.icon ? (
                  <Icon
                    name={option.icon}
                    size={18}
                    color={option.selected ? colors.primary : colors.textSecondary}
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: fontFamily.extraBold,
                    fontSize: 15,
                    lineHeight: 24,
                    color: option.selected ? colors.primary : colors.textPrimary,
                  }}
                >
                  {option.label}
                </Text>
                {option.selected ? <Icon name="check" size={18} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
