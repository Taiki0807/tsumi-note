import { useEffect, useMemo, useState } from 'react';
import { Dimensions, PanResponder } from 'react-native';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const OPEN_MS = 280;
const CLOSE_MS = 220;
const HIDDEN_Y = Dimensions.get('window').height;
const DISMISS_DRAG = 80;

/**
 * Open/close motion shared by bottom sheets (extracted from the timer settings sheet).
 * The sheet slides up without bounce, slides down on close, follows the grabber while dragging,
 * dismisses past a drag/velocity threshold and eases back otherwise. The backdrop fades with it.
 * Attach `panHandlers` to the grabber area, `backdropStyle`/`sheetStyle` to Animated.Views, and
 * render the Modal with `visible={mounted}` so the exit animation can finish.
 */
export function useSheetMotion({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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

  // Slide out from the current drag offset (no jump), then notify the parent.
  const dismissFromDrag = useMemo(
    () => () => {
      drag.set(
        withTiming(HIDDEN_Y, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onClose)();
        }),
      );
    },
    [drag, onClose],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          cancelAnimation(drag);
        },
        onPanResponderMove: (_, g) => {
          drag.set(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DRAG || g.vy > 0.8) {
            dismissFromDrag();
          } else {
            drag.set(withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }));
          }
        },
        onPanResponderTerminate: () => {
          drag.set(withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }));
        },
      }),
    [drag, dismissFromDrag],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * Math.max(0, 1 - drag.value / HIDDEN_Y),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * HIDDEN_Y + drag.value }],
  }));

  return { mounted, panHandlers: panResponder.panHandlers, backdropStyle, sheetStyle };
}
