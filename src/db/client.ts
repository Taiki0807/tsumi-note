import { randomUUID } from 'expo-crypto';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { GUEST_DATABASE_NAME } from './ownership';
import * as schema from './schema';
import type { AppDatabase, RepositoryDeps } from './types';

export const DATABASE_NAME = GUEST_DATABASE_NAME;

/** Opens an on-device SQLite database. Run migrations via `useMigrations` before using it. */
export function createDatabase(name: string = DATABASE_NAME): AppDatabase {
  const sqlite = openDatabaseSync(name, { enableChangeListener: true });
  sqlite.execSync('PRAGMA foreign_keys = ON;');
  return drizzle(sqlite, { schema });
}

/** Connections of the active owner, by file name. */
const open = new Map<string, AppDatabase>();

/** The shared connection for `name` (opened on first use). */
export function openDatabase(name: string): AppDatabase {
  let db = open.get(name);
  if (!db) {
    db = createDatabase(name);
    open.set(name, db);
  }
  return db;
}

/** Closes every shared connection except `name`, so a previous owner's database is no longer held open. */
export function closeDatabasesExcept(name: string): void {
  for (const [other, db] of open) {
    if (other === name) continue;
    open.delete(other);
    try {
      closeDatabase(db);
    } catch {
      // Already closed; nothing to release.
    }
  }
}

export function closeDatabase(db: AppDatabase): void {
  (db as unknown as { $client: { closeSync(): void } }).$client.closeSync();
}

export function createRepositoryDeps(db: AppDatabase): RepositoryDeps {
  return { db, now: Date.now, newId: randomUUID };
}
