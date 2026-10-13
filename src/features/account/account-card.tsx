import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { Notice, PasswordInput } from '@/features/auth/auth-ui';
import { canSyncNow, describeSync, syncBadge, type SyncTone } from '@/sync/describe';
import type { SyncStatus } from '@/sync/controller';

import { providerLabel, type AccountResult } from './account-api';

export type AccountSync = {
  status: SyncStatus;
  lastSyncedAt: number | null;
  pending: number;
  conflicts: number;
  syncNow: () => void;
};

type Props = {
  email: string;
  /** ログイン方法。取得できていない間は null */
  providers: string[] | null;
  /** サーバーに削除依頼が残っている(前回の削除が途中で止まった)。再試行で完了させる */
  deletionPending?: boolean;
  sync: AccountSync;
  onLogout: () => Promise<AccountResult<unknown> | { ok: boolean; message?: string }>;
  onDelete: (password?: string) => Promise<AccountResult<unknown>>;
  /** ログイン方法を再取得する(オフラインで取得できなかったとき) */
  onRetryInfo: () => void;
};

type Sheet = 'none' | 'logout' | 'delete';

/**
 * アカウント画面(Figma 17)の本体。削除の確認シート(Figma 18)は既存の BottomSheet / Button で構成。
 */
export function AccountCardView({
  email,
  providers,
  deletionPending = false,
  sync,
  onLogout,
  onDelete,
  onRetryInfo,
}: Props) {
  const colors = useTheme();
  const [sheet, setSheet] = useState<Sheet>('none');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  const badge = syncBadge(sync);
  const toneColor: Record<SyncTone, string> = {
    ok: colors.successText,
    busy: colors.primary,
    warn: colors.warningText,
    error: colors.danger,
  };
  const needsPassword = providers?.includes('credential') ?? false;

  const close = () => {
    if (inFlight.current) return;
    setSheet('none');
    setError(null);
    setPassword('');
  };

  /** 実行中の再実行は無視する(二重送信防止) */
  const run = async (task: () => Promise<{ ok: boolean; message?: string }>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await task();
      if (!result.ok) setError(result.message ?? '問題が発生しました。もう一度お試しください。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const heading = (text: string) => (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: fontFamily.extraBold,
        ...typography.heading,
        lineHeight: 30,
        color: colors.textPrimary,
      }}
    >
      {text}
    </Text>
  );
  const body = (text: string) => (
    <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
      {text}
    </Text>
  );

  const initial = (email.trim()[0] ?? '?').toUpperCase();
  const methods = providers === null ? '確認中…' : providers.map(providerLabel).join('、') || '不明';
  const rowLabel = { fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 22, color: colors.textSecondary };

  return (
    <View style={{ gap: 16 }}>
      {/* Figma 17 Profile: 64pt avatar (radius 32, 26 ExtraBold), 14pt gap */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text
            style={{ fontFamily: fontFamily.extraBold, fontSize: 26, lineHeight: 28, color: colors.primary }}
          >
            {initial}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          accessibilityLabel={`メールアドレス ${email}`}
          style={{
            flex: 1,
            fontFamily: fontFamily.extraBold,
            fontSize: 20,
            lineHeight: 28,
            color: colors.textPrimary,
          }}
        >
          {email}
        </Text>
      </View>

      {/* Figma 17 Card: radius 16, padding 16/4, rows with 12pt vertical padding and a top divider */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 4,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <Text style={[rowLabel, { flex: 1 }]}>メールアドレス</Text>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: fontFamily.extraBold,
              ...typography.body,
              color: colors.textPrimary,
            }}
          >
            {email}
          </Text>
        </View>
        <View
          style={{
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.divider,
          }}
        >
          <Text style={rowLabel}>ログイン方法: {methods}</Text>
        </View>
      </View>

      {/* Figma 17 Devices card: radius 16, padding 16/14/16/6。端末一覧は仕様外のため、この端末の同期状態を示す */}
      <View
        style={{
          gap: 4,
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 14,
          paddingBottom: 6,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              flex: 1,
              fontFamily: fontFamily.extraBold,
              ...typography.caption,
              color: colors.textSecondary,
            }}
          >
            同期の状態
          </Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor[badge.tone] }} />
          <Text
            accessibilityRole="text"
            style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: toneColor[badge.tone] }}
          >
            {badge.label}
          </Text>
        </View>
        <View style={{ paddingVertical: 10 }}>
          <Notice tone={badge.tone === 'error' ? 'error' : 'info'}>{describeSync(sync)}</Notice>
        </View>
      </View>
      <Button
        variant="secondary"
        label={sync.status === 'syncing' ? '同期中…' : '今すぐ同期'}
        disabled={!canSyncNow(sync.status)}
        onPress={sync.syncNow}
      />
      <Button variant="secondary" label="ログアウト" onPress={() => setSheet('logout')} />

      {/* Figma 17 Danger zone: trash icon + 14 ExtraBold label (44pt), 12 Bold caption below */}
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 16 }}>
        {deletionPending ? (
          <Notice tone="error">アカウントの削除が完了していません。削除を再試行してください。</Notice>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => setSheet('delete')}
          style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 }}
        >
          <Icon name="trash" size={18} color={colors.danger} strokeWidth={2} />
          <Text
            style={{ fontFamily: fontFamily.extraBold, fontSize: 14, lineHeight: 22, color: colors.danger }}
          >
            {deletionPending ? 'アカウント削除を再試行' : 'アカウントを削除'}
          </Text>
        </Pressable>
        <Text style={{ fontFamily: fontFamily.bold, ...typography.caption, color: colors.textSecondary }}>
          クラウドの記録が消え、元に戻せません
        </Text>
      </View>

      <BottomSheet visible={sheet === 'logout'} onClose={close} gap={16}>
        {heading('ログアウトしますか？')}
        {body(
          sync.pending > 0
            ? `まだ同期されていない変更が${sync.pending}件あります。この端末のデータは削除されません。再ログインすると同期を続けられます。`
            : 'この端末のこのアカウントのデータは削除されません。再ログインすると同じデータを使えます。',
        )}
        {body('ログアウト後はゲストの状態に戻り、アカウントのデータは表示されません。')}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button label="キャンセル" variant="secondary" flex disabled={busy} onPress={close} />
          <Button
            label={busy ? 'ログアウト中…' : 'ログアウト'}
            flex
            disabled={busy}
            onPress={() => void run(onLogout)}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'delete'} onClose={close} gap={16}>
        {heading('アカウントを削除しますか？')}
        {body(
          '次のデータを完全に削除します。元に戻すことはできません。\n・アカウント情報(メールアドレス・ログイン方法)\n・クラウドに保存された学習記録・ノート・問題・復習の状態・目標\n・クラウド上のノート画像\n・この端末に保存されているこのアカウントのデータと画像\n他の端末も同期できなくなります。',
        )}
        {body('ゲストとして保存した記録は削除されません。')}
        {deletionPending ? (
          <Notice tone="error">
            前回のアカウント削除が完了していません。もう一度「削除を再試行」を押すと、続きから削除します。
          </Notice>
        ) : null}
        {providers === null ? (
          <>
            <Notice tone="info">
              ログイン方法を確認できていません。パスワードでログインしている場合は入力してください(Apple /
              Google のみの場合は空欄のままで構いません)。
            </Notice>
            <PasswordInput
              label="現在のパスワード"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
            <Button label="ログイン方法を再取得" variant="secondary" onPress={onRetryInfo} />
          </>
        ) : needsPassword ? (
          <PasswordInput
            label="現在のパスワード"
            value={password}
            onChangeText={setPassword}
            editable={!busy}
          />
        ) : (
          body(
            'Apple / Google のアカウントは、直近にログインしている必要があります。エラーになった場合は、ログインし直してからもう一度お試しください。',
          )
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button label="キャンセル" variant="secondary" flex disabled={busy} onPress={close} />
          <Button
            label={busy ? '削除中…' : deletionPending ? '削除を再試行' : '削除する'}
            variant="danger"
            flex
            disabled={busy || (needsPassword && password.length === 0)}
            // ログイン方法が不明なときも妨げない。必要なら入力されたパスワードを送り、判断(本人確認)はサーバーが行う
            onPress={() =>
              void run(() =>
                onDelete(needsPassword || providers === null ? password || undefined : undefined),
              )
            }
          />
        </View>
      </BottomSheet>
    </View>
  );
}
