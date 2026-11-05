import { useRef, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';

import { fontFamily, typography, useTheme } from '@/design';

import { shareRecordImage } from './share-record';

/**
 * Header 「共有」 button shared by 学習記録 (week) and 日別の記録 (day): captures the screen's share view and opens
 * the iOS share sheet. Ignores taps while an image is being generated / the sheet is open, and shows the same
 * alert when sharing fails. (Figma未定義 — styled like the other header actions.)
 */
export function ShareButton({
  accessibilityLabel,
  disabled,
  capture,
  message,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  capture: () => Promise<string>;
  /** Share text (with hashtags) passed along with the image; none = image only. */
  message?: string;
}) {
  const colors = useTheme();
  const [busy, setBusy] = useState(false);
  // The ref blocks a second tap in the same frame, before `busy` has re-rendered.
  const running = useRef(false);
  const inactive = disabled || busy;

  const onPress = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      if ((await shareRecordImage(capture, undefined, message)) === 'failed') {
        Alert.alert('共有できませんでした', 'もう一度お試しください。');
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={{
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceMuted,
        opacity: inactive ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.extraBold,
          fontSize: typography.bodySm.fontSize,
          lineHeight: typography.bodySm.lineHeight,
          color: colors.textPrimary,
        }}
      >
        共有
      </Text>
    </Pressable>
  );
}
