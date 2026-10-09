import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, Button } from '@/components/form-ui';
import { closeDatabase, createDatabase } from '@/db/client';
import { useDatabaseContext } from '@/db/database-provider';
import { hasLocalData } from '@/db/guest-transfer';
import { GUEST_DATABASE_NAME } from '@/db/ownership';
import { declineGuestImport, needsImportPrompt, runGuestImport } from '@/db/run-guest-import';
import type { AppDatabase } from '@/db/types';
import { fontFamily, typography, useTheme } from '@/design';
import { copyGuestImagesToAccount } from '@/features/notes/note-image-store';

import migrations from '../../../drizzle/migrations';
import { Notice } from './auth-ui';

type Step =
  | { name: 'checking' }
  | { name: 'idle' }
  | { name: 'ask'; accountHasData: boolean }
  | { name: 'importing' }
  | { name: 'failed' };

/**
 * ログイン中、端末にゲストデータがあり、まだ引き継ぎの可否を決めていない場合に確認する(未デザイン: 既存のBottomSheetで仮実装)。
 * - 「引き継ぐ」: ゲストのデータと画像をこのアカウントへ「コピー」する。ゲストのデータは削除しない。
 * - 「引き継がない」: 以後たずねない。ゲストのデータは端末に残る。
 * - 「あとで」: 何も記録せず閉じる(次回起動時に再度たずねる)。
 * ゲストDBは読み取り専用の別接続で開き、アカウントDBへの書き込みは1トランザクションで行う。
 */
export function GuestImportGate() {
  const { db, owner, databaseName, reload } = useDatabaseContext();
  // The provider remounts this component per database, so the guest never needs a prompt.
  const [step, setStep] = useState<Step>(owner === null ? { name: 'idle' } : { name: 'checking' });

  useEffect(() => {
    if (owner === null) return;
    let cancelled = false;
    void withGuestDatabase(async (guest) => {
      const ask = needsImportPrompt(guest, db, GUEST_DATABASE_NAME);
      if (!cancelled) setStep(ask ? { name: 'ask', accountHasData: hasLocalData(db) } : { name: 'idle' });
    }).catch(() => {
      // ゲストDBを確認できなくても、アカウントの利用は妨げない(ゲストのデータはそのまま残る)。
      if (!cancelled) setStep({ name: 'idle' });
    });
    return () => {
      cancelled = true;
    };
  }, [db, owner, databaseName]);

  const importNow = useCallback(async () => {
    if (owner === null) return;
    setStep({ name: 'importing' });
    try {
      const outcome = await withGuestDatabase(async (guest) =>
        await runGuestImport({
          guest,
          account: db,
          guestDatabaseName: GUEST_DATABASE_NAME,
          copyImages: () => copyGuestImagesToAccount(owner),
          now: Date.now,
        }),
      );
      if (outcome.ok) reload();
      else setStep({ name: 'failed' });
    } catch {
      setStep({ name: 'failed' });
    }
  }, [db, owner, reload]);

  const decline = useCallback(() => {
    declineGuestImport(db, GUEST_DATABASE_NAME, Date.now());
    setStep({ name: 'idle' });
  }, [db]);

  return (
    <BottomSheet
      visible={step.name === 'ask' || step.name === 'importing' || step.name === 'failed'}
      onClose={() => step.name !== 'importing' && setStep({ name: 'idle' })}
      gap={16}
    >
      <SheetBody
        step={step}
        onImport={() => void importNow()}
        onDecline={decline}
        onLater={() => setStep({ name: 'idle' })}
      />
    </BottomSheet>
  );
}

function SheetBody({
  step,
  onImport,
  onDecline,
  onLater,
}: {
  step: Step;
  onImport: () => void;
  onDecline: () => void;
  onLater: () => void;
}) {
  const colors = useTheme();
  const busy = step.name === 'importing';
  return (
    <View style={{ gap: 16 }}>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fontFamily.extraBold,
          ...typography.heading,
          lineHeight: 30,
          color: colors.textPrimary,
        }}
      >
        この端末の記録を引き継ぎますか？
      </Text>
      <Text style={{ fontFamily: fontFamily.bold, ...typography.bodySm, color: colors.textSecondary }}>
        {step.name === 'ask' && step.accountHasData
          ? 'このアカウントには、すでに記録があります。ゲストで作成した記録を追加で取り込みます。アカウントの既存のデータは上書きされません。'
          : 'ゲストで作成した学習記録・ノート・問題・復習の状態・目標・設定・ノート画像を、このアカウントへコピーします。'}
        {'\n'}この端末のゲストデータは削除されません。
      </Text>
      {step.name === 'failed' ? (
        <Notice tone="error">
          引き継ぎを完了できませんでした。途中までのデータは反映されていません。端末のデータはそのまま残っています。もう一度お試しください。
        </Notice>
      ) : null}
      <Button label={busy ? '引き継ぎ中…' : '引き継ぐ'} disabled={busy} onPress={onImport} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="引き継がない" variant="secondary" flex disabled={busy} onPress={onDecline} />
        <Button label="あとで" variant="secondary" flex disabled={busy} onPress={onLater} />
      </View>
    </View>
  );
}

/** ゲストDBを別接続で開き(最新のマイグレーションを適用)、処理後に必ず閉じる。 */
async function withGuestDatabase<T>(run: (guest: AppDatabase) => Promise<T> | T): Promise<T> {
  const guest = createDatabase(GUEST_DATABASE_NAME);
  try {
    await migrate(guest as unknown as Parameters<typeof migrate>[0], migrations);
    return await run(guest);
  } finally {
    try {
      closeDatabase(guest);
    } catch {
      // 既に閉じている。
    }
  }
}
