import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Driver-agnostic Drizzle database type.
 * The app uses `expo-sqlite`; tests use `better-sqlite3` (both are synchronous drivers).
 */
// The run-result type differs per driver, hence `any`.
export type AppDatabase = BaseSQLiteDatabase<'sync', any, typeof schema>;

export type Clock = () => number;
export type IdGenerator = () => string;

export type RepositoryDeps = {
  db: AppDatabase;
  /** Epoch milliseconds. Injectable for deterministic tests. */
  now: Clock;
  /** Offline-safe unique id (UUID). Injectable for deterministic tests. */
  newId: IdGenerator;
};
