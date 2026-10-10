import type { SyncStatus } from './controller';

type Described = { status: SyncStatus; lastSyncedAt: number | null; pending: number; conflicts: number };

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
