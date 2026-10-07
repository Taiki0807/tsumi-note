import type { Folder, Note, NoteInput, Repositories } from '@/db/repositories';

import { isNoteEmpty } from './note-format';
import { extractImageFiles, removeOrphanImages, type ImageFiles } from './note-images';

type NoteRepos = Pick<Repositories, 'folders' | 'notes'>;

export type NoteRow = {
  note: Note;
  /** `null` = 未分類. */
  folder: Folder | null;
  /** Position of the folder among live folders; drives the tile color. `-1` for 未分類. */
  folderIndex: number;
};

export type NoteList = {
  rows: NoteRow[];
  /** Live folders, used for the filter tabs and the folder picker (tombstoned folders never appear). */
  folders: Folder[];
};

/**
 * Use case: notes for the list screen. `folderId` filters to one folder; a non-blank `query` matches
 * title or Markdown body. Order: pinned first, then most recently updated.
 */
export function loadNoteList(
  { folders, notes }: NoteRepos,
  options: { query?: string; folderId?: string } = {},
): NoteList {
  const liveFolders = folders.list();
  const indexById = new Map(liveFolders.map((folder, index) => [folder.id, index]));
  const rows = notes.list({ query: options.query, folderId: options.folderId }).map((note) => {
    const index = note.folderId ? (indexById.get(note.folderId) ?? -1) : -1;
    return { note, folder: index >= 0 ? (liveFolders[index] ?? null) : null, folderIndex: index };
  });
  return { rows, folders: liveFolders };
}

export type NoteDetail = { note: Note; folder: Folder | null; folders: Folder[] };

/** Use case: one note with its folder; `undefined` when it does not exist or was deleted. */
export function loadNoteDetail({ folders, notes }: NoteRepos, noteId: string): NoteDetail | undefined {
  const note = notes.getById(noteId);
  if (!note) return undefined;
  const liveFolders = folders.list();
  return { note, folder: liveFolders.find((f) => f.id === note.folderId) ?? null, folders: liveFolders };
}

/**
 * Use case (auto-save): creates the note on its first non-empty save, updates it afterwards.
 * Returns the note id, or `undefined` while a new note is still empty (nothing is written).
 *
 * With `files`, images the previous body referenced but the saved body no longer does are released
 * *after* the write succeeded (a failed write throws before any file is touched).
 */
export function saveNote(
  { notes }: Pick<Repositories, 'notes'>,
  noteId: string | undefined,
  input: NoteInput,
  files?: ImageFiles,
): string | undefined {
  if (noteId === undefined) {
    if (isNoteEmpty(input)) return undefined;
    return notes.create(input).id;
  }
  const before = notes.getById(noteId)?.body ?? '';
  notes.update(noteId, input);
  if (files) {
    const kept = extractImageFiles(input.body);
    releaseImages(
      { notes },
      files,
      extractImageFiles(before).filter((f) => !kept.includes(f)),
    );
  }
  return noteId;
}

/** Use case: tombstones a note, then releases the images only it referenced. */
export function deleteNote({ notes }: Pick<Repositories, 'notes'>, noteId: string, files?: ImageFiles): void {
  const candidates = extractImageFiles(notes.getById(noteId)?.body ?? '');
  notes.softDelete(noteId);
  if (files) releaseImages({ notes }, files, candidates);
}

/**
 * Removes `candidates` (files a just-persisted change stopped referencing) unless a live note still
 * references them. No grace period: these files were known to be referenced, so they are not
 * "new, not yet saved" images. Best-effort: file errors are left for the next `sweepNoteImages`.
 */
export function releaseImages(
  { notes }: Pick<Repositories, 'notes'>,
  files: ImageFiles,
  candidates: string[],
): string[] {
  if (candidates.length === 0) return [];
  const used = new Set(notes.list().flatMap((note) => extractImageFiles(note.body)));
  const removed: string[] = [];
  for (const fileName of candidates) {
    if (used.has(fileName)) continue;
    try {
      files.remove(fileName);
      removed.push(fileName);
    } catch {
      // Picked up by the next sweep.
    }
  }
  return removed;
}

/**
 * Use case: removes stored images that no live note references any more (deleted notes, images
 * removed from the text). Recently added files are kept until their note has had time to save.
 */
export function sweepNoteImages(
  { notes }: Pick<Repositories, 'notes'>,
  files: ImageFiles,
  now: number = Date.now(),
): string[] {
  return removeOrphanImages(
    files,
    notes.list().map((note) => note.body),
    now,
  );
}
