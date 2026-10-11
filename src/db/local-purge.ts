import { databaseNameForOwner, imageDirectoryForOwner, isValidAccountId } from './ownership';

/**
 * アカウント削除後に、この端末のそのアカウント専用のDBと画像を削除する(PHASE8_DESIGN §12)。
 * - サーバーでの削除が完了したあとにだけ予約される。ログアウトでは予約されない(ログアウトでは何も削除しない)。
 * - 予約は不透明なアカウントIDだけをKeychainに保存し、アプリが終了しても次回起動で続きを実行する。
 * - 実行はそのアカウントのDBが閉じられ、別の所有者(ゲスト)に切り替わった後。開いているDBは決して削除しない。
 * - 削除できる名前はアカウントIDから導出したものだけ。ゲストDB・ゲスト画像・他アカウントには触れない。
 */
export type PurgeStorage = {
  get(): string | null;
  set(id: string): void;
  clear(): void;
};

export type PurgeDeps = {
  storage: PurgeStorage;
  deleteDatabase(name: string): Promise<void>;
  deleteImageDirectory(name: string): void;
};

export function requestLocalPurge(storage: PurgeStorage, accountId: string): void {
  if (isValidAccountId(accountId)) storage.set(accountId);
}

/** 予約があれば実行する。実行したら true。失敗時は予約を残し、次回起動で再試行する */
export async function runPendingPurge(deps: PurgeDeps, activeDatabaseName: string): Promise<boolean> {
  const id = deps.storage.get();
  if (!id || !isValidAccountId(id)) {
    if (id) deps.storage.clear();
    return false;
  }
  const databaseName = databaseNameForOwner(id);
  if (databaseName === activeDatabaseName) return false; // 使用中は削除しない
  try {
    await deps.deleteDatabase(databaseName);
    deps.deleteImageDirectory(imageDirectoryForOwner(id));
  } catch {
    return false;
  }
  deps.storage.clear();
  return true;
}
