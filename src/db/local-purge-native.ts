import { Directory, Paths } from 'expo-file-system';
import { deleteDatabaseAsync } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';

import { runPendingPurge, type PurgeDeps, type PurgeStorage } from './local-purge';

const KEY = 'tsumi-note.pending-purge';

/** 削除予約。アカウントIDのみ(メール・トークンは含まない)をKeychainに保存する */
export const purgeStorage: PurgeStorage = {
  get: () => {
    try {
      return SecureStore.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (id) => SecureStore.setItem(KEY, id),
  clear: () => {
    void SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  },
};

const nativeDeps: PurgeDeps = {
  storage: purgeStorage,
  deleteDatabase: async (name) => {
    try {
      await deleteDatabaseAsync(name);
    } catch {
      // ファイルが既に無い場合も成功とみなす
    }
  },
  deleteImageDirectory: (name) => {
    const directory = new Directory(Paths.document, name);
    if (directory.exists) directory.delete();
  },
};

export function runPendingLocalPurge(activeDatabaseName: string): Promise<boolean> {
  return runPendingPurge(nativeDeps, activeDatabaseName);
}
