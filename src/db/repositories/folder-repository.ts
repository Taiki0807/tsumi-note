import { and, asc, eq, isNull } from 'drizzle-orm';

import { folders } from '../schema';
import type { RepositoryDeps } from '../types';

export type Folder = typeof folders.$inferSelect;

/**
 * Reference implementation of a Mutable Entity repository:
 * - ids are generated locally (offline-safe),
 * - `updatedAt` is bumped on every write,
 * - deletion is a tombstone (`deletedAt`) so it can be synced later.
 * Reads never return tombstoned rows.
 */
export function createFolderRepository({ db, now, newId }: RepositoryDeps) {
  return {
    create(input: { name: string }): Folder {
      const timestamp = now();
      const row = {
        id: newId(),
        name: input.name,
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

    list(): Folder[] {
      return db.select().from(folders).where(isNull(folders.deletedAt)).orderBy(asc(folders.createdAt)).all();
    },

    rename(id: string, name: string): void {
      db.update(folders)
        .set({ name, updatedAt: now() })
        .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
        .run();
    },

    softDelete(id: string): void {
      const timestamp = now();
      db.update(folders)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
        .run();
    },
  };
}

export type FolderRepository = ReturnType<typeof createFolderRepository>;
