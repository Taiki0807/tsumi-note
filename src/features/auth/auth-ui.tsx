import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { IconButton } from '@/components/form-ui';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';

import { checkPassword } from './validation';

/**
 * アカウント画面の共通部品。
 * Figma 14「メールで登録」の値: App bar 64pt(戻る 44pt + タイトル 18/26 ExtraBold)、本文 padding 24/8、
 * 縦の間隔 20、Input 52pt・border 1.5・radius 12(focus 時は primary の枠と white 塗り)。
 * Figma に存在しない画面(ログイン・メール確認・再設定)も同じ値と既存トークンで組む(未デザイン)。
 */
export function AuthScaffold({
  title,
  onBack,
  children,
  footer,
}: {
  title?: string;
  /** 指定しない場合は戻るボタンを出さない */
  onBack?: () => void;
  children: ReactNode;
  /** 画面下部に固定する操作(Figma 14 Bottom actions: padding 24/16/24/32) */
  footer?: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}
    >
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
        {onBack ? <IconButton name="arrow-left" label="戻る" onPress={onBack} /> : null}
        {title ? (
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              marginLeft: onBack ? 0 : 12,
              fontFamily: fontFamily.extraBold,
              ...typography.headingSm,
              color: colors.textPrimary,
            }}
          >
            {title}
          </Text>
        ) : null}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          gap: 20,
          paddingTop: 8,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            gap: 12,
            paddingTop: 16,
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 32),
            backgroundColor: colors.background,
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function ScreenHeading({ title, description }: { title: string; description?: string }) {
  const colors = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityRole="header"
        style={{ fontFamily: fontFamily.extraBold, fontSize: 24, lineHeight: 32, color: colors.textPrimary }}
      >
        {title}
      </Text>
      {description ? (
        <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

/** Figma Field/Input。ラベル 14/22 ExtraBold + 入力欄(focus で primary の枠)。trailing に「表示」トグルを置ける */
export function AuthInput({
  label,
  error,
  trailing,
  onFocus,
  onBlur,
  ...inputProps
}: { label: string; error?: string | null; trailing?: ReactNode } & Omit<TextInputProps, 'style'>) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.bodySm, color: colors.textPrimary }}>
        {label}
      </Text>
      <View
        style={{
          height: 52,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: trailing ? 8 : 16,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          borderRadius: radius.md,
          backgroundColor: focused ? colors.surface : colors.surfaceMuted,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            padding: 0,
            fontFamily: fontFamily.bold,
            fontSize: typography.button.fontSize,
            lineHeight: typography.button.lineHeight,
            color: colors.textPrimary,
          }}
          {...inputProps}
        />
        {trailing}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.danger }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** パスワード入力。Figma Toggle/表示: 50x36・primarySoft・全角丸・13/16 ExtraBold */
export function PasswordInput({
  label = 'パスワード',
  isNew,
  ...rest
}: { label?: string; isNew?: boolean; error?: string | null } & Omit<
  TextInputProps,
  'style' | 'secureTextEntry'
>) {
  const colors = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <AuthInput
      label={label}
      secureTextEntry={!visible}
      textContentType={isNew ? 'newPassword' : 'password'}
      autoComplete={isNew ? 'new-password' : 'current-password'}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'パスワードを隠す' : 'パスワードを表示'}
          onPress={() => setVisible((v) => !v)}
          style={{
            height: 36,
            minWidth: 50,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 12,
            borderRadius: radius.full,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.label, color: colors.primary }}>
            {visible ? '隠す' : '表示'}
          </Text>
        </Pressable>
      }
      {...rest}
    />
  );
}

/**
 * Figma のパスワード条件: check 14pt(success)+ 12/16 ExtraBold(successText)。
 * 満たしていない条件の見た目は Figma に無いため、textSecondary の文字とチェック無しで表す(推測)。
 */
export function PasswordRequirements({ password, email }: { password: string; email: string }) {
  const colors = useTheme();
  const checks = checkPassword(password, email);
  const items = [
    { ok: checks.length, text: '10文字以上' },
    { ok: checks.mixed, text: '英字と数字を含む' },
    ...(checks.noEmailPart ? [] : [{ ok: false, text: 'メールアドレスの一部を含まない' }]),
  ];
  return (
    <View style={{ gap: 6, paddingTop: 2 }} accessibilityLabel="パスワードの条件">
      {items.map((item) => (
        <View key={item.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
            {item.ok ? <Icon name="check" size={14} color={colors.success} strokeWidth={1.75} /> : null}
          </View>
          <Text
            style={{
              fontFamily: fontFamily.extraBold,
              ...typography.caption,
              color: item.ok ? colors.successText : colors.textSecondary,
            }}
          >
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Figma Provider/…: 56pt・全角丸・16/24 ExtraBold。Apple は黒、Google は白+枠、メールは primarySoft(固定値) */
export function ProviderButton({
  provider,
  label,
  onPress,
  disabled,
  busy,
}: {
  provider: 'apple' | 'google' | 'email';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const colors = useTheme();
  const style = {
    apple: { bg: '#000000', fg: '#ffffff', border: undefined },
    google: { bg: '#ffffff', fg: '#212121', border: '#e0e0e0' },
    email: { bg: colors.primarySoft, fg: colors.primary, border: undefined },
  }[provider];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={{
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: radius.full,
        backgroundColor: style.bg,
        borderWidth: style.border ? 1.5 : 0,
        borderColor: style.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {busy ? <ActivityIndicator color={style.fg} /> : null}
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.button, color: style.fg }}>{label}</Text>
    </Pressable>
  );
}

/** エラー・通知の帯(Figma に無いため既存の danger / success トークンで構成) */
export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const colors = useTheme();
  const palette = {
    error: { bg: colors.dangerSoft, fg: colors.danger },
    success: { bg: colors.successSoft, fg: colors.successText },
    info: { bg: colors.infoSoft, fg: colors.infoText },
  }[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{ padding: 14, borderRadius: radius.md, backgroundColor: palette.bg }}
    >
      <Text
        style={{ fontFamily: fontFamily.extraBold, ...typography.label, lineHeight: 20, color: palette.fg }}
      >
        {children}
      </Text>
    </View>
  );
}

/** テキストリンク(Figma「アカウントをお持ちの方は ログイン」: 14/22 または 12/16 の 700 + primary のリンク部分) */
export function TextLink({
  prefix,
  label,
  onPress,
  size = 'md',
  disabled,
}: {
  prefix?: string;
  label: string;
  onPress: () => void;
  size?: 'md' | 'sm';
  disabled?: boolean;
}) {
  const colors = useTheme();
  const type = size === 'sm' ? typography.caption : typography.bodySm;
  return (
    <Text style={{ textAlign: 'center', fontFamily: fontFamily.bold, ...type, color: colors.textSecondary }}>
      {prefix ? `${prefix} ` : ''}
      <Text
        accessibilityRole="link"
        accessibilityState={{ disabled: !!disabled }}
        onPress={disabled ? undefined : onPress}
        style={{ fontFamily: fontFamily.extraBold, color: disabled ? colors.textSecondary : colors.primary }}
      >
        {label}
      </Text>
    </Text>
  );
}

/** ゲストのままホームへ戻る。ログインを強制しないための導線 */
export function goHome() {
  router.replace('/');
}
