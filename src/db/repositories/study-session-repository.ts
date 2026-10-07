import { desc, eq, gte } from 'drizzle-orm';

import { studySessions } from '../schema';
import type { RepositoryDeps } from '../types';

export type StudySession = typeof studySessions.$inferSelect;

/**
 * Reference implementation of an Append-only Event repository.
 * Only `record` and reads exist on purpose: history is never updated or deleted.
 */
export function createStudySessionRepository({ db, now, newId }: RepositoryDeps) {
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
      const row = {
        id: input.id ?? newId(),
        folderId: input.folderId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationSeconds:
          input.durationSeconds ?? Math.max(0, Math.round((input.endedAt - input.startedAt) / 1000)),
        createdAt: now(),
      };
      db.insert(studySessions).values(row).onConflictDoNothing({ target: studySessions.id }).run();
      return db.select().from(studySessions).where(eq(studySessions.id, row.id)).get() ?? row;
    },

    listSince(startedAtOrAfter: number): StudySession[] {
      return db
        .select()
        .from(studySessions)
        .where(gte(studySessions.startedAt, startedAtOrAfter))
        .orderBy(desc(studySessions.startedAt))
        .all();
    },
  };
}

export type StudySessionRepository = ReturnType<typeof createStudySessionRepository>;
