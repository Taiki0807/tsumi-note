import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { normalizeQuestionInput } from '../../domain/validation';
import { folders, questions } from '../schema';
import type { RepositoryDeps } from '../types';

export type Question = typeof questions.$inferSelect;

/**
 * Mutable Entity repository for questions. A question always belongs to a live folder.
 * Prompt / answer are trimmed and must not be blank. Deletion is a tombstone; reads skip it.
 * FSRS state is intentionally not stored here (Phase 5).
 */
export function createQuestionRepository({ db, now, newId }: RepositoryDeps) {
  return {
    create(input: { folderId: string; prompt: string; answer: string }): Question {
      const { prompt, answer } = normalizeQuestionInput(input);
      const folder = db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.id, input.folderId), isNull(folders.deletedAt)))
        .get();
      if (!folder) throw new Error(`Folder not found: ${input.folderId}`);

      const timestamp = now();
      const row = {
        id: newId(),
        folderId: input.folderId,
        prompt,
        answer,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      db.insert(questions).values(row).run();
      return row;
    },

    getById(id: string): Question | undefined {
      return db
        .select()
        .from(questions)
        .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
        .get();
    },

    /** Newest first. */
    listByFolder(folderId: string): Question[] {
      return db
        .select()
        .from(questions)
        .where(and(eq(questions.folderId, folderId), isNull(questions.deletedAt)))
        .orderBy(desc(questions.createdAt))
        .all();
    },

    /** Live question count per folder id (folders without questions are absent). */
    countsByFolder(): Record<string, number> {
      const rows = db
        .select({ folderId: questions.folderId, total: count() })
        .from(questions)
        .where(isNull(questions.deletedAt))
        .groupBy(questions.folderId)
        .all();
      return Object.fromEntries(rows.map((r) => [r.folderId, r.total]));
    },

    countByFolder(folderId: string): number {
      return (
        db
          .select({ total: count() })
          .from(questions)
          .where(and(eq(questions.folderId, folderId), isNull(questions.deletedAt)))
          .get()?.total ?? 0
      );
    },

    update(id: string, input: { prompt: string; answer: string }): void {
      const { prompt, answer } = normalizeQuestionInput(input);
      db.update(questions)
        .set({ prompt, answer, updatedAt: now() })
        .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
        .run();
    },

    softDelete(id: string): void {
      const timestamp = now();
      db.update(questions)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(and(eq(questions.id, id), isNull(questions.deletedAt)))
        .run();
    },
  };
}

export type QuestionRepository = ReturnType<typeof createQuestionRepository>;
