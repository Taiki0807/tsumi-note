import { and, asc, count, eq, isNull } from 'drizzle-orm';

import { normalizeFolderName } from '../../domain/validation';
import { folders, notes, questions } from '../schema';
import type { RepositoryDeps } from '../types';
import { containsPattern, likeContains } from './search';

export type Folder = typeof folders.$inferSelect;

/**
 * Reference implementation of a Mutable Entity repository:
 * - ids are generated locally (offline-safe),
 * - `updatedAt` is bumped on every write,
 * - deletion is a tombstone (`deletedAt`) so it can be synced later.
 * Reads never return tombstoned rows. Names are trimmed and must not be blank.
 */
export function createFolderRepository({ db, now, newId }: RepositoryDeps) {
  return {
    create(input: { name: string }): Folder {
      const name = normalizeFolderName(input.name);
      const timestamp = now();
      const row = {
        id: newId(),
        name,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      db.insert(folders).values(row).run();
      return row;
    },

    getById(id: string): Folder | undefined {
      return db
        .select()
        .from(folders)
        .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
        .get();
    },

    /** Live notes that deleting the folder would detach (`folderId = null`). */
    countNotes(id: string): number {
      const row = db
        .select({ n: count() })
        .from(notes)
        .where(and(eq(notes.folderId, id), isNull(notes.deletedAt)))
        .get();
      return row?.n ?? 0;
    },

    /** Live folders, oldest first. A non-blank `query` keeps folders whose name contains it. */
    list(options: { query?: string } = {}): Folder[] {
      const pattern = containsPattern(options.query);
      return db
        .select()
        .from(folders)
        .where(and(isNull(folders.deletedAt), pattern ? likeContains(folders.name, pattern) : undefined))
        .orderBy(asc(folders.createdAt))
        .all();
    },

    rename(id: string, name: string): void {
      const normalized = normalizeFolderName(name);
      db.update(folders)
        .set({ name: normalized, updatedAt: now() })
        .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
        .run();
    },

    /**
     * Tombstones the folder and, in the same transaction, its live questions (a question cannot
     * exist without a folder). Notes are kept but detached (`folderId = null`). Append-only
     * history (study sessions, answers, reviews) is never touched.
     */
    softDelete(id: string): void {
      const timestamp = now();
      db.transaction((tx) => {
        const target = tx
          .select({ id: folders.id })
          .from(folders)
          .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
          .get();
        if (!target) return;
        tx.update(questions)
          .set({ deletedAt: timestamp, updatedAt: timestamp })
          .where(and(eq(questions.folderId, id), isNull(questions.deletedAt)))
          .run();
        tx.update(notes)
          .set({ folderId: null, updatedAt: timestamp })
          .where(and(eq(notes.folderId, id), isNull(notes.deletedAt)))
          .run();
        tx.update(folders)
          .set({ deletedAt: timestamp, updatedAt: timestamp })
          .where(eq(folders.id, id))
          .run();
      });
    },
  };
}

export type FolderRepository = ReturnType<typeof createFolderRepository>;
