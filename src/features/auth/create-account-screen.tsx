import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Icon, type IconName } from '@/components/icons';
import { fontFamily, layout, radius, typography, useTheme } from '@/design';

import { goHome, Notice, ProviderButton, TextLink } from './auth-ui';
import { useSocialSignIn } from './use-social-sign-in';

const SYNC_ITEMS: { icon: IconName; tone: 'primary' | 'info' | 'warning'; title: string; sub: string }[] = [
  { icon: 'chart', tone: 'primary', title: '学習記録とタイマー', sub: '学習時間・セッション・目標' },
  { icon: 'note', tone: 'info', title: 'ノート', sub: '見出し・リスト・チェックリスト' },
  { icon: 'cards', tone: 'warning', title: '問題と復習の予定', sub: 'フォルダー・正答率・次の復習日' },
];

/**
 * Figma 13 アカウント作成。Top bar 56pt(「あとで」リンク)、Content padding 24/0/24/28・gap 18、
 * Hero(AppIcon 80 + 26/34 + 14/22)、Sync card(16pt radius・padding 16/16/16/4)、
 * Provider ボタン 56pt ×3(gap 10)、規約 11/17、ログイン導線 14/22。
 */
export function CreateAccountScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const social = useSocialSignIn();
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    void social.checkApple().then(setAppleAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone = {
    primary: { bg: colors.primarySoft, fg: colors.primary },
    info: { bg: colors.infoSoft, fg: colors.info },
    warning: { bg: colors.warningSoft, fg: colors.warning },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
          height: 56,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingTop: 12,
          paddingRight: 16,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="あとで（アカウントを作らずに続ける）"
          onPress={() => (router.canGoBack() ? router.back() : goHome())}
          style={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }}
        >
          <Text
            style={{ fontFamily: fontFamily.extraBold, ...typography.bodySm, color: colors.textSecondary }}
          >
            あとで
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          gap: 18,
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 28),
        }}
      >
        <View style={{ gap: 12 }}>
          <AppIcon size={80} cornerRadius={20 * (200 / 80)} />
          <Text
            accessibilityRole="header"
            style={{ fontFamily: fontFamily.extraBold, ...typography.title, color: colors.textPrimary }}
          >
            アカウントを作成
          </Text>
          <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
            アカウントがあれば、学習の記録を iPhone と iPad のどちらからでも続けられます。
          </Text>
        </View>

        <View
          style={{
            paddingLeft: 16,
            paddingTop: 16,
            paddingRight: 16,
            paddingBottom: 4,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.divider,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: colors.primary }}>
            すべての端末で同期されるもの
          </Text>
          {SYNC_ITEMS.map((item, i) => (
            <View
              key={item.title}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.divider,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  backgroundColor: tone[item.tone].bg,
                }}
              >
                <Icon name={item.icon} size={22} color={tone[item.tone].fg} strokeWidth={1.83} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}
                >
                  {item.sub}
                </Text>
              </View>
              <Icon name="check" size={20} color={colors.success} strokeWidth={2.5} />
            </View>
          ))}
        </View>

        {/* Figma に無い追加(未デザイン): 同期・引き継ぎは後続PRで有効になるため、現時点の状態を明示する */}
        <Notice tone="info">
          アカウントを作成しても、この端末の学習データは削除されません。端末間の同期とデータの引き継ぎは、今後のアップデートで有効になります。
        </Notice>

        <View style={{ gap: 10 }}>
          <ProviderButton
            provider="apple"
            label="Appleで続ける"
            disabled={!social.configured || !appleAvailable}
            busy={social.busy === 'apple'}
            onPress={() => void social.signIn('apple').then((ok) => ok && router.replace('/mypage'))}
          />
          <ProviderButton
            provider="google"
            label="Googleで続ける"
            disabled={!social.configured || !social.googleReady}
            busy={social.busy === 'google'}
            onPress={() => void social.signIn('google').then((ok) => ok && router.replace('/mypage'))}
          />
          <ProviderButton
            provider="email"
            label="メールアドレスで登録"
            disabled={!social.configured}
            onPress={() => router.push('/account/signup')}
          />
        </View>

        {social.error ? <Notice tone="error">{social.error}</Notice> : null}
        {!social.configured ? (
          <Notice tone="info">
            アカウント機能はこのビルドでは未設定です。ゲストとして通常どおり利用できます。
          </Notice>
        ) : null}

        <Text
          style={{
            fontFamily: fontFamily.bold,
            fontSize: 11,
            lineHeight: 17,
            textAlign: 'center',
            color: colors.textSecondary,
          }}
        >
          続けると、利用規約とプライバシーポリシーに同意したことになります。
        </Text>
        <TextLink
          prefix="アカウントをお持ちの方は"
          label="ログイン"
          onPress={() => router.push('/account/login')}
        />
      </ScrollView>
    </View>
  );
}
