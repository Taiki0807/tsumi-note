import { eq, isNull, sql } from 'drizzle-orm';

import {
  answerHistory,
  folders,
  fsrsStates,
  goals,
  notes,
  questions,
  reviewHistory,
  settings,
  studySessions,
  syncMetadata,
} from './schema';
import type { AppDatabase } from './types';

/** Per (guest database -> account database) decision, stored in the account database. */
export type TransferDecision = 'imported' | 'declined';

const decisionKey = (guestDatabaseName: string) => `guest_import:${guestDatabaseName}`;

export function readTransferDecision(
  account: AppDatabase,
  guestDatabaseName: string,
): TransferDecision | undefined {
  const row = account
    .select()
    .from(syncMetadata)
    .where(eq(syncMetadata.key, decisionKey(guestDatabaseName)))
    .get();
  return row?.value === 'imported' || row?.value === 'declined' ? row.value : undefined;
}

export function recordTransferDecision(
  account: Pick<AppDatabase, 'insert'>,
  guestDatabaseName: string,
  decision: TransferDecision,
  now: number,
): void {
  account
    .insert(syncMetadata)
    .values({ key: decisionKey(guestDatabaseName), value: decision, updatedAt: now })
    .onConflictDoUpdate({ target: syncMetadata.key, set: { value: decision, updatedAt: now } })
    .run();
}

function countRows(db: AppDatabase, table: typeof folders | typeof settings): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(table)
      .get()?.n ?? 0
  );
}

/** True when the database holds anything the user created (tombstones and event rows count). */
export function hasLocalData(db: AppDatabase): boolean {
  const tables = [folders, notes, questions, goals, settings, studySessions, answerHistory, reviewHistory];
  return tables.some((table) => countRows(db, table as typeof folders) > 0);
}

export type TransferResult = {
  /** Rows newly written to the account database, per table. Rows that already existed are not counted. */
  inserted: Record<string, number>;
  /** Active guest goals not copied because the account already has an active goal (v1 allows one). */
  skippedGoals: number;
};

const CHUNK = 50; // stays below SQLite's bound-variable limit

/**
 * Copies every guest row into the account database. Never modifies or deletes the guest database.
 *
 * - One transaction on the account database (rows and the `imported` marker): any failure rolls back everything.
 * - Ids are kept, so references stay intact; rows whose id (or settings key) already exists in the account
 *   are left untouched (`onConflictDoNothing`), so re-running is safe and duplicate-free, and the account's
 *   existing data is never overwritten.
 */
export function copyGuestDataToAccount(
  guest: AppDatabase,
  account: AppDatabase,
  guestDatabaseName: string,
  now: number,
): TransferResult {
  // The guest database is only read.
  const source = {
    folders: guest.select().from(folders).all(),
    notes: guest.select().from(notes).all(),
    questions: guest.select().from(questions).all(),
    goals: guest.select().from(goals).all(),
    settings: guest.select().from(settings).all(),
    fsrsStates: guest.select().from(fsrsStates).all(),
    studySessions: guest.select().from(studySessions).all(),
    answerHistory: guest.select().from(answerHistory).all(),
    reviewHistory: guest.select().from(reviewHistory).all(),
  };

  return account.transaction((tx) => {
    const inserted: Record<string, number> = {};
    const insertAll = (name: string, table: unknown, rows: object[]) => {
      let n = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const result = (
          tx
            .insert(table as typeof folders)
            .values(rows.slice(i, i + CHUNK) as (typeof folders.$inferInsert)[])
            .onConflictDoNothing()
            .run() as { changes?: number }
        ).changes;
        n += result ?? 0;
      }
      inserted[name] = n;
    };

    insertAll('folders', folders, source.folders);
    insertAll('notes', notes, source.notes);
    insertAll('questions', questions, source.questions);

    const accountHasActiveGoal = tx.select({ id: goals.id }).from(goals).where(isNull(goals.deletedAt)).get();
    let skippedGoals = 0;
    const goalRows = source.goals.filter((goal) => {
      const skip = accountHasActiveGoal !== undefined && goal.deletedAt === null;
      if (skip) skippedGoals += 1;
      return !skip;
    });
    insertAll('goals', goals, goalRows);

    insertAll('settings', settings, source.settings);
    insertAll('fsrsStates', fsrsStates, source.fsrsStates);
    insertAll('studySessions', studySessions, source.studySessions);
    insertAll('answerHistory', answerHistory, source.answerHistory);
    insertAll('reviewHistory', reviewHistory, source.reviewHistory);

    recordTransferDecision(tx, guestDatabaseName, 'imported', now);
    return { inserted, skippedGoals };
  });
}
