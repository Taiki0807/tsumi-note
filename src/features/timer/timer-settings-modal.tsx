import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
 * Not designed in Figma (PRODUCT_SPEC: 未デザイン); built from existing tokens only.
 * App-wide settings (e.g. dark mode) intentionally do not live here.
 */
export function TimerSettingsModal({ visible, settings, onChange, onClose }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="タイマー設定を閉じる"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        />
        <View
          style={{
            gap: 16,
            paddingTop: 20,
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 24,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            backgroundColor: colors.surface,
            ...shadow.card,
          }}
        >
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
        </View>
      </View>
    </Modal>
  );
}
