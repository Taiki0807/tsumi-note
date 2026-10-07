import { Modal, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetMotion } from '@/components/use-sheet-motion';
import { fontFamily, radius, shadow, typography, useTheme } from '@/design';

import type { TimerSettings } from './timer-logic';
import { TimerSettingsPanel } from './timer-settings-panel';

type Props = {
  visible: boolean;
  settings: TimerSettings;
  onChange: (next: TimerSettings) => void;
  onClose: () => void;
};

/**
 * Timer-only settings shown as a bottom sheet on its own layer, so the timer screen never reflows.
 * The sheet slides up from the bottom edge (no bounce) and slides back down on close; it can be
 * dismissed via the backdrop, the 完了 button, or by dragging the handle downwards.
 * Open/close motion lives in `useSheetMotion`, shared with the library form sheets.
 * Not designed in Figma (PRODUCT_SPEC: 未デザイン); built from existing tokens only.
 * App-wide settings (e.g. dark mode) intentionally do not live here.
 */
export function TimerSettingsModal({ visible, settings, onChange, onClose }: Props) {
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
          <Pressable accessibilityLabel="タイマー設定を閉じる" onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          style={[
            {
              gap: 16,
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
          <View
            {...panHandlers}
            style={{
              alignItems: 'center',
              paddingTop: 12,
              paddingBottom: 20,
              marginTop: -8,
              marginBottom: -12,
            }}
          >
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text
              style={{ fontFamily: fontFamily.extraBold, ...typography.headingSm, color: colors.textPrimary }}
            >
              タイマー設定
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={{ height: 44, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text style={{ fontFamily: fontFamily.bold, ...typography.body, color: colors.primary }}>
                完了
              </Text>
            </Pressable>
          </View>
          <TimerSettingsPanel settings={settings} onChange={onChange} />
        </Animated.View>
      </View>
    </Modal>
  );
}
