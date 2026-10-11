import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components/form-ui';
import { Icon } from '@/components/icons';
import { fontFamily, radius, typography, useTheme } from '@/design';
import { useDatabaseContext } from '@/db/database-provider';
import { armDeviceWipe, disarmDeviceWipe, takeWipeNotice, WIPE_DONE_MESSAGE, type WipeNotice } from '@/db/device-wipe';
import { wipeDeviceNative } from '@/db/device-wipe-native';
import { useAuth } from '@/features/auth/auth-context';
import { Notice } from '@/features/auth/auth-ui';
import { useSync } from '@/sync/sync-provider';

import { deleteLocalData, describeLocalDeletion } from './local-data-deletion';

/**
 * プライバシーとデータ内の「端末内のデータをすべて削除」(Figma に無い追加。既存の BottomSheet / Button / Notice のみ)。
 * 削除の範囲・ログイン中の扱いは local-data-deletion.ts を参照。
 * 結果の通知は、アプリの共通の通知 Notice(成功=successSoft / 失敗=dangerSoft)を画面内に表示する。
 */
export function LocalDataDeletionSection() {
  const colors = useTheme();
  const { db, owner, reload } = useDatabaseContext();
  const { state, api } = useAuth();
  const sync = useSync();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // ログアウトでDBが切り替わると画面が作り直されるため、直近の結果は作り直し後に受け取る
  const [result, setResult] = useState<WipeNotice | null>(() => takeWipeNotice());

  // 所有者(開いているDB)とログイン状態が一致するときだけ実行できる。セッション復元中などは無効にする
  const signedIn = state.status === 'signedIn' && owner !== null && state.user.id === owner;
  const ready = owner === null ? state.status === 'signedOut' : signedIn;
  const copy = describeLocalDeletion({ signedIn: owner !== null, pending: sync.pending });

  const close = () => {
    if (inFlight.current) return;
    setOpen(false);
    setError(null);
  };

  const confirm = async () => {
    if (inFlight.current || !ready) return; // 二重実行の防止
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await deleteLocalData({
        accountId: owner,
        wipeNow: () => wipeDeviceNative(db),
        arm: armDeviceWipe,
        disarm: disarmDeviceWipe,
        signOut: () => api.signOut(),
      });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setOpen(false);
      // ログイン中: 削除はログアウト後(ゲストDBへ切り替わった後)に DatabaseProvider が1回だけ実行し、結果を通知する
      if (!outcome.deferred) {
        setResult({ tone: 'success', message: WIPE_DONE_MESSAGE });
        reload();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        gap: 14,
        padding: 20,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <Text
        style={{ fontFamily: fontFamily.extraBold, fontSize: 17, lineHeight: 26, color: colors.textPrimary }}
      >
        端末内のデータをすべて削除
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.regular,
          ...typography.caption,
          lineHeight: 18,
          color: colors.textSecondary,
        }}
      >
        {owner === null
          ? 'ゲストと、この端末に残っているすべてのアカウントのローカルデータを削除します。クラウドやほかの端末のデータは削除されません。元に戻せません。'
          : 'ログアウトして、ゲストと、この端末に残っているすべてのアカウントのローカルデータを削除します。クラウドのデータは削除されず、再ログインすると読み込まれます。クラウドのデータを削除するには、アカウントを削除してください。'}
      </Text>
      {result ? <Notice tone={result.tone}>{result.message}</Notice> : null}
      <Button
        variant="danger"
        label="端末内のデータをすべて削除"
        disabled={!ready || busy}
        onPress={() => setOpen(true)}
      />

      <BottomSheet visible={open} onClose={close} gap={16}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.dangerSoft,
          }}
        >
          <Icon name="trash" size={28} color={colors.danger} strokeWidth={2} />
        </View>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.extraBold,
            ...typography.heading,
            lineHeight: 30,
            color: colors.textPrimary,
          }}
        >
          {copy.title}
        </Text>
        {copy.paragraphs.map((p) => (
          <Text
            key={p}
            style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}
          >
            {p}
          </Text>
        ))}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button label="キャンセル" variant="secondary" flex disabled={busy} onPress={close} />
          <Button
            label={busy ? '削除中…' : copy.confirmLabel}
            variant="danger"
            flex
            disabled={busy || !ready}
            onPress={() => void confirm()}
          />
        </View>
      </BottomSheet>
    </View>
  );
}
