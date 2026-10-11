/**
 * 「端末内のデータをすべて削除」(マイページ → 設定 → プライバシーとデータ)。
 *
 * 責務の分け方(docs/PHASE8_DESIGN.md §13):
 * - この操作は「この端末だけ」を消す。クラウド(D1/R2)と他の端末には一切触れない。クラウドごと消すのは「アカウントを削除」。
 * - ゲスト: ゲストDBの全行・ゲスト画像・予約済みの通知を消す。スキーマ・マイグレーション履歴は残す。
 * - ログイン中: そのアカウントの端末内DBと画像を、ファイルごと削除する(行の削除はしない)。行を消すと削除の
 *   記録(tombstone)が未送信の変更として同期に乗り、クラウドと他の端末のデータが消えてしまうため。
 *   ファイルごと消してログアウトするので、同期状態(カーソル・未送信の変更・端末ID)もすべてなくなる。
 *   同じアカウントで再ログインすると、クラウドのデータがこの端末へ再び読み込まれる(復元される)。
 *   ゲストのデータは別のDBなので、ここでは削除しない(ログアウト後にゲストとして削除できる)。
 */
export type LocalDeletionResult = { ok: true } | { ok: false; message: string };

export type LocalDeletionDeps = {
  /** ログイン中のアカウントID。ゲストなら null */
  accountId: string | null;
  /** ゲストのDB行・画像・通知を削除する(失敗したら例外) */
  wipeGuest: () => Promise<void> | void;
  /** そのアカウントのDB・画像の削除を予約する(ゲストへ切り替わって接続が閉じた後に実行される) */
  requestAccountPurge: (accountId: string) => void;
  /** 予約を取り消す(ログアウトに失敗したとき) */
  cancelAccountPurge: () => void;
  signOut: () => Promise<{ ok: boolean }>;
};

const FAILED = '削除を完了できませんでした。もう一度お試しください。';
const SIGN_OUT_FAILED =
  'ログアウトできなかったため、削除していません。通信状況を確認して、もう一度お試しください。';

export async function deleteLocalData(deps: LocalDeletionDeps): Promise<LocalDeletionResult> {
  if (deps.accountId === null) {
    try {
      await deps.wipeGuest();
      return { ok: true };
    } catch {
      return { ok: false, message: FAILED };
    }
  }
  try {
    deps.requestAccountPurge(deps.accountId);
  } catch {
    return { ok: false, message: FAILED };
  }
  let signedOut = false;
  try {
    signedOut = (await deps.signOut()).ok;
  } catch {
    signedOut = false;
  }
  if (!signedOut) {
    // ログアウトしていないのに予約を残すと、後のログアウトで意図せず消えてしまう
    deps.cancelAccountPurge();
    return { ok: false, message: SIGN_OUT_FAILED };
  }
  return { ok: true };
}

export type DeletionCopy = {
  title: string;
  /** 段落ごと */
  paragraphs: string[];
  confirmLabel: string;
  doneTitle: string;
  doneMessage: string;
};

export function describeLocalDeletion(input: { signedIn: boolean; pending: number }): DeletionCopy {
  const common =
    'この端末に保存されている学習記録、ノート、復習データなどを削除します。削除したローカルデータは元に戻せません。';
  if (!input.signedIn) {
    return {
      title: '端末内のデータをすべて削除しますか？',
      paragraphs: [
        common,
        'ゲストのデータはこの端末にしかないため、完全に失われます。必要な場合は、先に「データを書き出す」を使ってください(ノートの画像は書き出されません)。',
      ],
      confirmLabel: 'すべて削除',
      doneTitle: '削除しました',
      doneMessage: 'この端末のデータを削除しました。',
    };
  }
  const paragraphs = [
    common,
    'ログイン中のため、このアカウントの端末内のデータを削除して、ログアウトします。クラウドに保存されたデータと、ほかの端末のデータは削除されません。',
    '同じアカウントで再ログインすると、クラウドのデータがこの端末に再び読み込まれます。クラウドのデータも削除したい場合は、「アカウントを削除」を実行してください。',
  ];
  if (input.pending > 0) {
    paragraphs.push(
      `まだ同期されていない変更が${input.pending}件あります。クラウドに届いていないため、削除すると失われます。先に「今すぐ同期」を実行してください。`,
    );
  }
  paragraphs.push('ゲストとして保存したデータは削除されません。');
  return {
    title: '端末内のデータをすべて削除しますか？',
    paragraphs,
    confirmLabel: 'すべて削除',
    doneTitle: '削除しました',
    doneMessage:
      'この端末のアカウントのデータを削除して、ログアウトしました。クラウドのデータは残っており、再ログインすると読み込まれます。',
  };
}
