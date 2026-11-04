import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm';

import { studySessions } from '../schema';
import type { RepositoryDeps } from '../types';

export type StudySession = typeof studySessions.$inferSelect;

export type StudySessionEdit = {
  folderId: string | null;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
};

/**
 * Mutable repository (since migration 0006; it used to be append-only):
 * - `record` is idempotent per id (1 timer session = 1 row) and never overwrites an existing row,
 * - `update` rewrites the editable fields and bumps `updatedAt` (the sync trigger enqueues it),
 * - `softDelete` leaves a tombstone (`deletedAt`) so the deletion can sync,
 * - reads never return tombstoned rows.
 */
export function createStudySessionRepository({ db, now, newId }: RepositoryDeps) {
  const live = isNull(studySessions.deletedAt);

  const getById = (id: string): StudySession | undefined =>
    db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, id), live))
      .get();

  return {
    /**
     * Idempotent when `id` is given: the primary key makes a second call with the same id a
     * no-op that returns the already stored row (1 session = 1 record).
     * `durationSeconds` defaults to endedAt - startedAt; pass it when pauses make them differ.
     */
    record(input: {
      id?: string;
      folderId: string | null;
      startedAt: number;
      endedAt: number;
      durationSeconds?: number;
    }): StudySession {
      const timestamp = now();
      const row = {
        id: input.id ?? newId(),
        folderId: input.folderId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationSeconds:
          input.durationSeconds ?? Math.max(0, Math.round((input.endedAt - input.startedAt) / 1000)),
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      db.insert(studySessions).values(row).onConflictDoNothing({ target: studySessions.id }).run();
      return db.select().from(studySessions).where(eq(studySessions.id, row.id)).get() ?? row;
    },

    getById,

    /** Rewrites the editable fields of a live session. Returns the stored row, or undefined if it is gone. */
    update(id: string, edit: StudySessionEdit): StudySession | undefined {
      db.update(studySessions)
        .set({
          folderId: edit.folderId,
          startedAt: edit.startedAt,
          endedAt: edit.endedAt,
          durationSeconds: edit.durationSeconds,
          updatedAt: now(),
        })
        .where(and(eq(studySessions.id, id), live))
        .run();
      return getById(id);
    },

    softDelete(id: string): void {
      const timestamp = now();
      db.update(studySessions)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(and(eq(studySessions.id, id), live))
        .run();
    },

    listSince(startedAtOrAfter: number): StudySession[] {
      return db
        .select()
        .from(studySessions)
        .where(and(gte(studySessions.startedAt, startedAtOrAfter), live))
        .orderBy(desc(studySessions.startedAt))
        .all();
    },

    /** Sessions whose `startedAt` is in [fromInclusive, toExclusive), newest first. */
    listBetween(fromInclusive: number, toExclusive: number): StudySession[] {
      return db
        .select()
        .from(studySessions)
        .where(
          and(gte(studySessions.startedAt, fromInclusive), lt(studySessions.startedAt, toExclusive), live),
        )
        .orderBy(desc(studySessions.startedAt))
        .all();
    },
  };
}

export type StudySessionRepository = ReturnType<typeof createStudySessionRepository>;
