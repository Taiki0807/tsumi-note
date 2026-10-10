import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components/form-ui';
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
  sync: AccountSync;
  onLogout: () => Promise<AccountResult<unknown> | { ok: boolean; message?: string }>;
  onDelete: (password?: string) => Promise<AccountResult<unknown>>;
  /** ログイン方法を再取得する(オフラインで取得できなかったとき) */
  onRetryInfo: () => void;
};

type Sheet = 'none' | 'logout' | 'delete';

/**
 * ログイン中のマイページのアカウントカード。Figma 16(マイページ・登録済み)は取得できていないため、
 * 既存のデザイントークンとコンポーネントで構成した仮実装(Figma準拠は未確認)。
 */
export function AccountCardView({ email, providers, sync, onLogout, onDelete, onRetryInfo }: Props) {
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

  return (
    <View
      style={{
        gap: 12,
        padding: 18,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ fontFamily: fontFamily.extraBold, ...typography.caption, color: colors.textSecondary }}>
        アカウント
      </Text>
      <Text
        numberOfLines={1}
        accessibilityLabel={`メールアドレス ${email}`}
        style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: colors.textPrimary }}
      >
        {email}
      </Text>
      <Text style={{ fontFamily: fontFamily.bold, ...typography.label, color: colors.textSecondary }}>
        ログイン方法: {providers === null ? '確認中…' : providers.map(providerLabel).join('、') || '不明'}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor[badge.tone] }} />
        <Text
          accessibilityRole="text"
          style={{ fontFamily: fontFamily.extraBold, ...typography.body, color: toneColor[badge.tone] }}
        >
          {badge.label}
        </Text>
      </View>
      <Notice tone={badge.tone === 'error' ? 'error' : 'info'}>{describeSync(sync)}</Notice>
      <Button
        variant="secondary"
        label={sync.status === 'syncing' ? '同期中…' : '今すぐ同期'}
        disabled={!canSyncNow(sync.status)}
        onPress={sync.syncNow}
      />
      <Button variant="secondary" label="ログアウト" onPress={() => setSheet('logout')} />
      <Button variant="danger" label="アカウントを削除" onPress={() => setSheet('delete')} />

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
        {providers === null ? (
          <>
            <Notice tone="error">アカウント情報を取得できません。接続を確認してください。</Notice>
            <Button label="再取得" variant="secondary" onPress={onRetryInfo} />
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
            label={busy ? '削除中…' : '削除する'}
            variant="danger"
            flex
            disabled={busy || providers === null || (needsPassword && password.length === 0)}
            onPress={() => void run(() => onDelete(needsPassword ? password : undefined))}
          />
        </View>
      </BottomSheet>
    </View>
  );
}
