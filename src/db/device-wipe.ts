import { GUEST_DATABASE_NAME, GUEST_IMAGE_DIRECTORY } from './ownership';

/**
 * 「端末内のデータをすべて削除」の実行計画と、実行の合図(docs/PHASE8_DESIGN.md §13)。
 *
 * - 削除の合図(arm)は **メモリ上だけ** に持つ。Keychain・ファイルには保存しないので、アプリの終了・再起動で必ず消え、
 *   後日のログアウトやログインで突然データが消えることはない。有効期限も短く、1回使うと消える。
 * - ログイン中は、ログアウトが成功してゲストのDBに切り替わった後(アカウントのDBが閉じた後)に1回だけ実行される。
 *   ログアウトに失敗したら合図を取り消し、何も削除しない。
 * - 対象はゲストと、この端末に残っているすべてのアカウントのDB・画像。クラウドと他の端末には触れない。
 */
const ACCOUNT_DATABASE = /^(tsumi-note-acct-[0-9a-f]+\.db)(-wal|-shm|-journal)?$/;
const ACCOUNT_IMAGES = /^note-images-acct-[0-9a-f]+$/;
const ARM_TTL_MS = 60_000;

/** SQLite ディレクトリのファイル名から、アカウント別DBの名前(-wal/-shm/-journal を除く)を重複なく取り出す */
export function accountDatabaseNames(fileNames: readonly string[]): string[] {
  const names = new Set<string>();
  for (const file of fileNames) {
    const base = ACCOUNT_DATABASE.exec(file)?.[1];
    if (base) names.add(base);
  }
  return [...names];
}

/** ドキュメントディレクトリ直下の名前から、アカウント別の画像ディレクトリ名を取り出す */
export function accountImageDirectories(entryNames: readonly string[]): string[] {
  return entryNames.filter((name) => ACCOUNT_IMAGES.test(name));
}

export type DeviceWipeDeps = {
  /** 開いているゲストDBの全行を1トランザクションで削除する */
  wipeGuestRows: () => void;
  deleteGuestImages: () => void;
  cancelScheduledNotifications: () => Promise<void>;
  /** SQLite ディレクトリ内のファイル名 */
  listDatabaseFiles: () => string[];
  /** ドキュメントディレクトリ直下の名前 */
  listDocumentEntries: () => string[];
  deleteDatabase: (name: string) => Promise<void>;
  deleteImageDirectory: (name: string) => void;
};

/**
 * ゲスト(開いているDBの行・画像・予約済み通知)と、残っているアカウント別DB・画像をすべて削除する。
 * ゲストDBのスキーマ・マイグレーション履歴は残す。途中で失敗したら例外を投げる(削除済みの分は戻らないが、
 * 残りは再実行で削除できる。クラウドへの影響はない)。
 */
export async function wipeDevice(deps: DeviceWipeDeps): Promise<void> {
  const databases = accountDatabaseNames(deps.listDatabaseFiles()).filter((n) => n !== GUEST_DATABASE_NAME);
  const directories = accountImageDirectories(deps.listDocumentEntries()).filter(
    (n) => n !== GUEST_IMAGE_DIRECTORY,
  );
  deps.wipeGuestRows();
  deps.deleteGuestImages();
  await deps.cancelScheduledNotifications();
  for (const name of databases) await deps.deleteDatabase(name);
  for (const name of directories) deps.deleteImageDirectory(name);
}

let armedAt: number | null = null;

/** ログアウト後に1回だけ端末内の全削除を実行する合図(メモリのみ) */
export function armDeviceWipe(now: number = Date.now()): void {
  armedAt = now;
}

export function disarmDeviceWipe(): void {
  armedAt = null;
}

/** 合図が有効なら取り出して消す(1回限り)。期限切れ・未設定なら false */
export function consumeDeviceWipe(now: number = Date.now()): boolean {
  const at = armedAt;
  armedAt = null;
  return at !== null && now - at >= 0 && now - at <= ARM_TTL_MS;
}

export type WipeNotice = { tone: 'success' | 'error'; message: string };

let notice: WipeNotice | null = null;

/** 画面が作り直されても結果を表示できるように、直近の結果を1回だけ渡す */
export function setWipeNotice(value: WipeNotice): void {
  notice = value;
}

export function takeWipeNotice(): WipeNotice | null {
  const value = notice;
  notice = null;
  return value;
}

export const WIPE_DONE_MESSAGE = '端末内のデータを削除しました';
export const WIPE_FAILED_MESSAGE = '端末内のデータを削除できませんでした。もう一度お試しください。';
