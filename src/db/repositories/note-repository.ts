import { and, count, desc, eq, isNull, or } from 'drizzle-orm';

import { folders, notes } from '../schema';
import type { RepositoryDeps } from '../types';
import { containsPattern, likeContains } from './search';

export type Note = typeof notes.$inferSelect;

export type NoteInput = {
  title: string;
  /** Markdown source. Stored verbatim (never trimmed or rendered). */
  body: string;
  folderId: string | null;
};

/** Titles are single-line; surrounding whitespace is dropped. The Markdown body is left untouched. */
function normalizeTitle(raw: string): string {
  return raw.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Mutable Entity repository for notes (Phase 6).
 * - The body is the original Markdown string; only that is persisted.
 * - `folderId = null` means 未分類. A note can only be attached to a live folder.
 * - Deletion is a tombstone (`deletedAt`); reads skip it.
 * - Lists show pinned notes first, then most recently updated.
 */
export function createNoteRepository({ db, now, newId }: RepositoryDeps) {
  function assertLiveFolder(folderId: string | null): void {
    if (folderId === null) return;
    const folder = db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
      .get();
    if (!folder) throw new Error(`Folder not found: ${folderId}`);
  }

  return {
    create(input: Partial<NoteInput> = {}): Note {
      const folderId = input.folderId ?? null;
      assertLiveFolder(folderId);
      const timestamp = now();
      const row: Note = {
        id: newId(),
        folderId,
        title: normalizeTitle(input.title ?? ''),
        body: input.body ?? '',
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      db.insert(notes).values(row).run();
      return row;
    },

    getById(id: string): Note | undefined {
      return db
        .select()
        .from(notes)
        .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
        .get();
    },

    /**
     * Pinned first, then newest update first. A non-blank `query` keeps notes whose title or body
     * contains it; `folderId` keeps one folder's notes (`null` = 未分類).
     */
    list(options: { query?: string; folderId?: string | null } = {}): Note[] {
      const pattern = containsPattern(options.query);
      const folderFilter =
        options.folderId === undefined
          ? undefined
          : options.folderId === null
            ? isNull(notes.folderId)
            : eq(notes.folderId, options.folderId);
      return db
        .select()
        .from(notes)
        .where(
          and(
            isNull(notes.deletedAt),
            folderFilter,
            pattern ? or(likeContains(notes.title, pattern), likeContains(notes.body, pattern)) : undefined,
          ),
        )
        .orderBy(desc(notes.pinned), desc(notes.updatedAt), desc(notes.createdAt))
        .all();
    },

    /** Live notes per folder id (未分類 notes are not counted). */
    countsByFolder(): Record<string, number> {
      const rows = db
        .select({ folderId: notes.folderId, n: count() })
        .from(notes)
        .where(isNull(notes.deletedAt))
        .groupBy(notes.folderId)
        .all();
      const result: Record<string, number> = {};
      for (const row of rows) if (row.folderId) result[row.folderId] = row.n;
      return result;
    },

    update(id: string, input: NoteInput): void {
      assertLiveFolder(input.folderId);
      db.update(notes)
        .set({
          title: normalizeTitle(input.title),
          body: input.body,
          folderId: input.folderId,
          updatedAt: now(),
        })
        .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
        .run();
    },

    setPinned(id: string, pinned: boolean): void {
      db.update(notes)
        .set({ pinned, updatedAt: now() })
        .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
        .run();
    },

    softDelete(id: string): void {
      const timestamp = now();
      db.update(notes)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
        .run();
    },
  };
}

export type NoteRepository = ReturnType<typeof createNoteRepository>;
