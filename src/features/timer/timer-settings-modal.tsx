import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, PanResponder, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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

const OPEN_MS = 280;
const CLOSE_MS = 220;
const HIDDEN_Y = Dimensions.get('window').height;
const DISMISS_DRAG = 80;

/**
 * Timer-only settings shown as a bottom sheet on its own layer, so the timer screen never reflows.
 * The sheet slides up from the bottom edge (no bounce) and slides back down on close; it can be
 * dismissed via the backdrop, the 完了 button, or by dragging the handle downwards.
 * Not designed in Figma (PRODUCT_SPEC: 未デザイン); built from existing tokens only.
 * App-wide settings (e.g. dark mode) intentionally do not live here.
 */
export function TimerSettingsModal({ visible, settings, onChange, onClose }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  // Keep the Modal mounted while the exit animation runs.
  const [mounted, setMounted] = useState(visible);
  // 0 = hidden, 1 = fully shown
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    cancelAnimation(progress);
    if (visible) {
      drag.set(0);
      progress.set(withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }));
    } else {
      progress.set(
        withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [visible, progress, drag]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          drag.set(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DRAG || g.vy > 0.8) {
            onClose();
          } else {
            drag.set(withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) }));
          }
        },
        onPanResponderTerminate: () => {
          drag.set(withTiming(0, { duration: 160 }));
        },
      }),
    [drag, onClose],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * Math.max(0, 1 - drag.value / HIDDEN_Y),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * HIDDEN_Y + drag.value }],
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[
            { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
            backdropStyle,
          ]}
        >
          <Pressable
            accessibilityLabel="タイマー設定を閉じる"
            onPress={onClose}
            style={{ flex: 1 }}
          />
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
          <View {...panResponder.panHandlers} style={{ alignItems: 'center', paddingVertical: 8 }}>
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
