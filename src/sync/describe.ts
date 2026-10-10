import type { SyncStatus } from './controller';

type Described = { status: SyncStatus; lastSyncedAt: number | null; pending: number; conflicts: number };

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type SyncTone = 'ok' | 'busy' | 'warn' | 'error';

/** マイページの状態バッジ(短いラベル)。同期済み / 同期中 / オフライン / 同期エラー / アプリの更新が必要 など */
export function syncBadge({ status, pending }: Pick<Described, 'status' | 'pending'>): {
  label: string;
  tone: SyncTone;
} {
  switch (status) {
    case 'disabled':
      return { label: '確認中', tone: 'busy' };
    case 'syncing':
      return { label: '同期中', tone: 'busy' };
    case 'offline':
      return { label: 'オフライン', tone: 'warn' };
    case 'error':
      return { label: '同期エラー', tone: 'error' };
    case 'auth-error':
      return { label: '再ログインが必要', tone: 'error' };
    case 'update-required':
      return { label: 'アプリの更新が必要', tone: 'warn' };
    case 'idle':
      return pending > 0 ? { label: '未同期あり', tone: 'warn' } : { label: '同期済み', tone: 'ok' };
  }
}

/** 手動同期を受け付けられるか。同期中・準備中・アプリ更新が必要な間は再実行しない */
export function canSyncNow(status: SyncStatus): boolean {
  return status !== 'syncing' && status !== 'disabled' && status !== 'update-required';
}

/**
 * 同期状態の説明文(暫定表示。マイページのデザインは PR 6)。
 * どの状態でも、データはこの端末に保存済みであることを伝える。
 */
export function describeSync({ status, lastSyncedAt, pending, conflicts }: Described): string {
  const last = lastSyncedAt ? `最終同期: ${formatTime(lastSyncedAt)}` : '最終同期: まだありません';
  const saved = 'データはこの端末に保存されています。';
  const conflict =
    conflicts > 0 ? ` 同時に編集された${conflicts}件は「【競合コピー】」として残しました。` : '';
  switch (status) {
    case 'disabled':
      return 'ログイン情報を確認しています。同期は準備ができ次第始まります。';
    case 'syncing':
      return `同期中です。${saved}`;
    case 'offline':
      return `オフラインです。接続が戻ると自動で同期します。${saved}${pending > 0 ? `（未同期 ${pending}件）` : ''}`;
    case 'error':
      return `同期に失敗しました。自動で再試行します。${saved}${pending > 0 ? `（未同期 ${pending}件）` : ''}`;
    case 'auth-error':
      return `再ログインすると同期を再開できます。${saved}`;
    case 'update-required':
      return `アプリを更新すると、新しいデータの同期を続けられます。${saved}`;
    case 'idle':
      return pending > 0
        ? `未同期のデータが${pending}件あります。${last}`
        : `同期済みです。${last}${conflict}`;
  }
}
