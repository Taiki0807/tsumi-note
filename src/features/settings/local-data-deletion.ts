/**
 * 「端末内のデータをすべて削除」(マイページ → 設定 → プライバシーとデータ)。
 *
 * 責務の分け方(docs/PHASE8_DESIGN.md §13):
 * - この操作は「この端末だけ」を消す。クラウド(D1/R2)と他の端末には一切触れない。クラウドごと消すのは「アカウントを削除」。
 * - 対象は、ゲストと、この端末に残っているすべてのアカウントのローカルデータ(DB・画像・予約済みの通知)。
 *   スキーマ・マイグレーション履歴は残す。アカウントDBの行を消すと削除の記録(tombstone)が同期に乗ってクラウドが
 *   消えるため、アカウントDBは行ではなくファイルごと削除する。
 * - ゲスト: その場で削除する。
 * - ログイン中: 先にログアウトし(同期を止める)、ゲストのDBに切り替わって、アカウントのDBが閉じた後に1回だけ削除する。
 *   削除の合図はメモリ上だけに持ち、永続化しない(アプリの再起動で消える)。ログアウトに失敗したら何も削除しない。
 *   同期状態(カーソル・未送信の変更・端末ID)は各DBと一緒になくなるので、次回の同期で復元されることも、削除が伝わることもない。
 *   同じアカウントで再ログインすると、クラウドのデータがこの端末へ再び読み込まれる。
 */
export type LocalDeletionResult = { ok: true; deferred: boolean } | { ok: false; message: string };

export type LocalDeletionDeps = {
  /** ログイン中のアカウントID。ゲストなら null */
  accountId: string | null;
  /** 端末内のデータをいますぐ削除する(失敗したら例外) */
  wipeNow: () => Promise<void>;
  /** ログアウト後に1回だけ削除を実行する合図を出す・取り消す(メモリのみ) */
  arm: () => void;
  disarm: () => void;
  signOut: () => Promise<{ ok: boolean }>;
};

const FAILED = '端末内のデータを削除できませんでした。もう一度お試しください。';
const SIGN_OUT_FAILED =
  'ログアウトできなかったため、削除していません。通信状況を確認して、もう一度お試しください。';

export async function deleteLocalData(deps: LocalDeletionDeps): Promise<LocalDeletionResult> {
  if (deps.accountId === null) {
    try {
      await deps.wipeNow();
      return { ok: true, deferred: false };
    } catch {
      return { ok: false, message: FAILED };
    }
  }
  deps.arm();
  let signedOut = false;
  try {
    signedOut = (await deps.signOut()).ok;
  } catch {
    signedOut = false;
  }
  if (!signedOut) {
    deps.disarm();
    return { ok: false, message: SIGN_OUT_FAILED };
  }
  return { ok: true, deferred: true };
}

export type DeletionCopy = {
  title: string;
  /** 段落ごと */
  paragraphs: string[];
  confirmLabel: string;
};

export function describeLocalDeletion(input: { signedIn: boolean; pending: number }): DeletionCopy {
  const common =
    'この端末に保存されている学習記録、ノート、復習データ、ノートの画像、目標、設定などを削除します。削除したローカルデータは元に戻せません。';
  const scope =
    'ゲストとして保存したデータと、この端末でログインしたことのあるすべてのアカウントの端末内データが対象です。';
  if (!input.signedIn) {
    return {
      title: '端末内のデータをすべて削除しますか？',
      paragraphs: [
        common,
        scope,
        'クラウドやほかの端末のデータは削除されません。ゲストのデータはこの端末にしかないため、完全に失われます。必要な場合は、先に「データを書き出す」を使ってください(ノートの画像は書き出されません)。',
        'この端末に未同期の変更が残っているアカウントがある場合、それも失われます。',
      ],
      confirmLabel: 'すべて削除',
    };
  }
  const paragraphs = [
    common,
    scope,
    'ログイン中のため、先にログアウトしてから削除します。クラウドに保存されたデータと、ほかの端末のデータは削除されません。',
    '同じアカウントで再ログインすると、クラウドのデータがこの端末に再び読み込まれます。クラウドのデータも削除したい場合は、「アカウントを削除」を実行してください。',
  ];
  if (input.pending > 0) {
    paragraphs.push(
      `まだ同期されていない変更が${input.pending}件あります。クラウドに届いていないため、削除すると失われます。先に「今すぐ同期」を実行してください。`,
    );
  }
  paragraphs.push('ほかのアカウントの未同期の変更が端末に残っている場合も、削除すると失われます。');
  return { title: '端末内のデータをすべて削除しますか？', paragraphs, confirmLabel: 'すべて削除' };
}
