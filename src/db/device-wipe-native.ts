import { Directory, Paths } from 'expo-file-system';
import { deleteDatabaseAsync } from 'expo-sqlite';
import * as Notifications from 'expo-notifications';

import { wipeDevice } from './device-wipe';
import { deleteGuestImages } from './local-purge-native';
import { wipeDatabaseRows } from './local-wipe';
import type { AppDatabase } from './types';

function names(directory: Directory): string[] {
  if (!directory.exists) return [];
  return directory.list().map((entry) => entry.name);
}

/** 開いているゲストDBと、この端末に残っているすべてのアカウント別DB・画像を削除する */
export function wipeDeviceNative(guestDb: AppDatabase): Promise<void> {
  return wipeDevice({
    wipeGuestRows: () => void wipeDatabaseRows(guestDb),
    deleteGuestImages,
    cancelScheduledNotifications: () => Notifications.cancelAllScheduledNotificationsAsync(),
    listDatabaseFiles: () => names(new Directory(Paths.document, 'SQLite')),
    listDocumentEntries: () => names(new Directory(Paths.document)),
    deleteDatabase: (name) => deleteDatabaseAsync(name),
    deleteImageDirectory: (name) => {
      const directory = new Directory(Paths.document, name);
      if (directory.exists) directory.delete();
    },
  });
}
