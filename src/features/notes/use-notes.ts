import { useMemo, useState } from 'react';

import { useRepositories } from '@/db/database-provider';
import { useRevision } from '@/features/library/use-library';

import { loadNoteDetail, loadNoteList, saveNote, type NoteDetail, type NoteList } from './note-use-cases';

export function useNoteList() {
  const repos = useRepositories();
  const { revision, invalidate } = useRevision();
  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<string | undefined>(undefined);

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
      repos.notes.softDelete(id);
      invalidate();
    },
  };
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
      saveNote(repos, id, input),
    setPinned: (id: string, pinned: boolean) => {
      repos.notes.setPinned(id, pinned);
      invalidate();
    },
    deleteNote: (id: string) => repos.notes.softDelete(id),
  };
}
