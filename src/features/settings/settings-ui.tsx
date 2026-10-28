import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/form-ui';
import { fontFamily, layout, typography, useTheme } from '@/design';

/** Sub-screen chrome shared with 復習設定 / 目標: 64pt app bar with a back button, then a scrolling body. */
export function SettingsScaffold({
  title,
  children,
  closeIcon = false,
  gap = 14,
}: {
  title: string;
  children: ReactNode;
  /** A × instead of ← for screens that are entered as a form (Figma 02c). */
  closeIcon?: boolean;
  /** Vertical gap between the sections of the body (Figma: 14 for settings, 16–20 for records). */
  gap?: number;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
          height: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <IconButton
          name={closeIcon ? 'close' : 'arrow-left'}
          label={closeIcon ? '閉じる' : '戻る'}
          onPress={() => router.back()}
        />
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            ...typography.headingSm,
            color: colors.textPrimary,
          }}
        >
          {title}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          gap,
          paddingTop: 8,
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
