import { randomUUID } from 'expo-crypto';
import { useCallback, useMemo, useState } from 'react';

import { useRepositories } from '@/db/database-provider';
import type { Repositories } from '@/db/repositories';
import { useRevision } from '@/features/library/use-library';

import { noteImageFiles, pickPhoto } from './note-image-store';
import { storePickedImage } from './note-images';
import {
  loadNoteDetail,
  loadNoteList,
  deleteNote as deleteNoteUseCase,
  saveNote,
  sweepNoteImages,
  type NoteDetail,
  type NoteList,
} from './note-use-cases';

export function useNoteList() {
  const repos = useRepositories();
  const { revision, invalidate } = useRevision();
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const sweepImages = useCallback(() => sweepImagesSafely(repos), [repos]);

  const list: NoteList = useMemo(
    () => loadNoteList(repos, { query, folderId }),
    // `revision` forces a re-read after focus / writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, query, folderId, revision],
  );
  // A filtered folder that was deleted falls back to すべて.
  const activeFolderId = list.folders.some((f) => f.id === folderId) ? folderId : undefined;

  return {
    ...list,
    query,
    setQuery,
    folderId: activeFolderId,
    setFolderId,
    setPinned: (id: string, pinned: boolean) => {
      repos.notes.setPinned(id, pinned);
      invalidate();
    },
    deleteNote: (id: string) => {
      deleteNoteUseCase(repos, id, noteImageFiles);
      invalidate();
    },
    /** Fallback on opening the list: drops images the save / delete release missed (e.g. file errors). */
    sweepImages,
  };
}

/** Image cleanup is best-effort: a file error must never block the note operation itself. */
function sweepImagesSafely(repos: Pick<Repositories, 'notes'>) {
  try {
    sweepNoteImages(repos, noteImageFiles);
  } catch {
    // Retried on the next sweep.
  }
}

export function useNoteEditor(noteId: string | undefined) {
  const repos = useRepositories();
  const { revision, invalidate } = useRevision();

  const detail: NoteDetail | undefined = useMemo(
    () => (noteId ? loadNoteDetail(repos, noteId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, noteId, revision],
  );

  return {
    detail,
    folders: useMemo(
      () => repos.folders.list(),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [repos, revision],
    ),
    /** Creates the note on first non-empty save; returns its id. */
    save: (id: string | undefined, input: { title: string; body: string; folderId: string | null }) =>
      saveNote(repos, id, input, noteImageFiles),
    setPinned: (id: string, pinned: boolean) => {
      repos.notes.setPinned(id, pinned);
      invalidate();
    },
    deleteNote: (id: string) => {
      deleteNoteUseCase(repos, id, noteImageFiles);
    },
    /** Copies a picked photo into app storage; returns the Markdown reference to insert. */
    attachImage: async () => {
      const picked = await pickPhoto();
      return picked ? storePickedImage(noteImageFiles, randomUUID, picked) : undefined;
    },
  };
}
