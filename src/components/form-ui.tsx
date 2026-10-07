import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, layout, radius, shadow, typography, useTheme } from '@/design';

import { Icon, type IconName } from './icons';

/** Figma Button (Primary / Secondary): 56pt high, fully rounded, Label 16/24 ExtraBold. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  flex,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Share the row equally with a sibling button (Figma: 165pt each, gap 12). */
  flex?: boolean;
}) {
  const colors = useTheme();
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: flex ? 1 : undefined,
        height: 56,
        paddingHorizontal: 32,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.primary : danger ? colors.dangerSoft : colors.primarySoft,
        opacity: disabled ? 0.4 : 1,
        ...(primary && !disabled ? shadow.primary : null),
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.button,
          color: primary ? colors.textOnPrimary : danger ? colors.danger : colors.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Figma IconButton: 44x44 circle, optionally filled with primarySoft. */
export function IconButton({
  name,
  label,
  onPress,
  tone = 'plain',
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'soft';
}) {
  const colors = useTheme();
  const soft = tone === 'soft';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: soft ? colors.primarySoft : undefined,
      }}
    >
      <Icon name={name} size={22} color={soft ? colors.primary : colors.textPrimary} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Figma Field/Input: label 14/22 ExtraBold + 1.5pt bordered, gray-100 filled input with radius 12. */
export function TextField({
  label,
  multiline,
  ...inputProps
}: { label: string; multiline?: boolean } & Omit<TextInputProps, 'style' | 'multiline'>) {
  const colors = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.bodySm, color: colors.textPrimary }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textPlaceholder}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          height: multiline ? 100 : 52,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 14 : 0,
          borderWidth: 1.5,
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
          fontFamily: fontFamily.regular,
          fontSize: typography.button.fontSize,
          lineHeight: typography.button.lineHeight,
          color: colors.textPrimary,
        }}
        {...inputProps}
      />
    </View>
  );
}

/**
 * Figma Bottom sheet: scrim #141030 @ 50%, white sheet with 24pt top radius, 40x5 grabber,
 * padding 12/24/36 and 20pt vertical gap.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,48,0.5)' }}
      >
        <Pressable accessibilityLabel="閉じる" onPress={onClose} style={{ flex: 1 }} />
        <View
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            gap: 20,
            paddingTop: 12,
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 36),
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surface,
            shadowColor: '#04060f',
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.08,
            shadowRadius: 32,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Minimal empty state built from existing tokens (not designed in Figma). */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  const colors = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySoft,
        }}
      >
        <Icon name={icon} size={26} color={colors.primary} strokeWidth={2.2} />
      </View>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.headingSm, color: colors.textPrimary }}>
        {title}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.bold,
          ...typography.caption,
          color: colors.textSecondary,
          textAlign: 'center',
        }}
      >
        {description}
      </Text>
    </View>
  );
}
