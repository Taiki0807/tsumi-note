import { randomUUID } from 'expo-crypto';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';
import type { AppDatabase, RepositoryDeps } from './types';

export const DATABASE_NAME = 'tsumi-note.db';

/** Opens the on-device SQLite database. Run migrations via `useMigrations` before using it. */
export function createDatabase(name: string = DATABASE_NAME): AppDatabase {
  const sqlite = openDatabaseSync(name, { enableChangeListener: true });
  sqlite.execSync('PRAGMA foreign_keys = ON;');
  return drizzle(sqlite, { schema });
}

export function createRepositoryDeps(db: AppDatabase): RepositoryDeps {
  return { db, now: Date.now, newId: randomUUID };
}
