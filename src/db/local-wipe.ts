import { sql } from 'drizzle-orm';

import type { AppDatabase } from './types';

/** Drizzle's migration journal and SQLite internals are not user data; the schema must survive a wipe. */
const KEEP = new Set(['__drizzle_migrations', 'sqlite_sequence']);

/**
 * Deletes every user row of one database (guest only: an account database is removed as a file instead, so
 * no tombstone or outbox row can ever reach the server). Tables, indexes, triggers and the migration journal
 * are kept, so the next launch needs no re-migration. Tables are read from `sqlite_master`, so a table
 * added by a later migration is wiped too. One transaction: either everything is deleted or nothing is.
 * Returns the table names that were cleared.
 */
export function wipeDatabaseRows(db: AppDatabase): string[] {
  return db.transaction((tx) => {
    const tables = tx
      .all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_'`,
      )
      .map((r) => r.name)
      .filter((name) => !KEEP.has(name));
    // Parents and children are deleted in any order; constraints are checked once at commit.
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    for (const name of tables) tx.run(sql`DELETE FROM ${sql.identifier(name)}`);
    return tables;
  });
}
