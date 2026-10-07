import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useRepositories } from '@/db/database-provider';

import {
  describeFolderDeletion,
  loadFolderDetail,
  loadFolderList,
  type FolderDetail,
  type FolderList,
} from './library-use-cases';

/** Returns a counter that bumps on screen focus and on `invalidate()` (after a write). No polling. */
function useRevision() {
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision((r) => r + 1), []);
  useFocusEffect(invalidate);
  return { revision, invalidate };
}

export function useFolderList() {
  const repos = useRepositories();
  const { revision, invalidate } = useRevision();

  // `revision` forces a re-read after focus / writes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list: FolderList = useMemo(() => loadFolderList(repos), [repos, revision]);

  return {
    ...list,
    createFolder: (name: string) => {
      const folder = repos.folders.create({ name });
      invalidate();
      return folder;
    },
  };
}

export function useFolderDetail(folderId: string) {
  const repos = useRepositories();
  const { revision, invalidate } = useRevision();

  const detail: FolderDetail | undefined = useMemo(
    () => loadFolderDetail(repos, folderId),
    // `revision` forces a re-read after focus / writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, folderId, revision],
  );

  return {
    detail,
    renameFolder: (name: string) => {
      repos.folders.rename(folderId, name);
      invalidate();
    },
    deleteFolder: () => {
      repos.folders.softDelete(folderId);
      invalidate();
    },
    getDeletionImpact: () => describeFolderDeletion(repos, folderId),
    createQuestion: (input: { prompt: string; answer: string }) => {
      repos.questions.create({ folderId, ...input });
      invalidate();
    },
    updateQuestion: (id: string, input: { prompt: string; answer: string }) => {
      repos.questions.update(id, input);
      invalidate();
    },
    deleteQuestion: (id: string) => {
      repos.questions.softDelete(id);
      invalidate();
    },
  };
}
