import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';

import * as schema from './schema';
import type { AppDatabase, RepositoryDeps } from './types';

/** In-memory SQLite with the real migrations applied. Test-only (uses better-sqlite3). */
export function createTestDatabase(): AppDatabase {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  return db;
}

/** Deterministic deps: ids are id-1, id-2, ...; the clock only moves when `tick` is called. */
export function createTestDeps(db: AppDatabase = createTestDatabase()) {
  let time = 1_000;
  let seq = 0;
  const deps: RepositoryDeps = { db, now: () => time, newId: () => `id-${++seq}` };
  return { deps, tick: (ms = 1_000) => (time += ms) };
}
