import { desc, gte } from 'drizzle-orm';

import { studySessions } from '../schema';
import type { RepositoryDeps } from '../types';

export type StudySession = typeof studySessions.$inferSelect;

/**
 * Reference implementation of an Append-only Event repository.
 * Only `record` and reads exist on purpose: history is never updated or deleted.
 */
export function createStudySessionRepository({ db, now, newId }: RepositoryDeps) {
  return {
    record(input: { folderId: string | null; startedAt: number; endedAt: number }): StudySession {
      const row = {
        id: newId(),
        folderId: input.folderId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationSeconds: Math.max(0, Math.round((input.endedAt - input.startedAt) / 1000)),
        createdAt: now(),
      };
      db.insert(studySessions).values(row).run();
      return row;
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
