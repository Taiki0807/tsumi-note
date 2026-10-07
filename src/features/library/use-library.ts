import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useRepositories } from '@/db/database-provider';
import { parseReviewSettings } from '@/domain/review-settings';

import {
  describeFolderDeletion,
  loadFolderDetail,
  loadFolderList,
  type FolderDetail,
  type FolderList,
} from './library-use-cases';
import type { QuestionFilter } from './question-list';

/** Returns a counter that bumps on screen focus and on `invalidate()` (after a write). No polling. */
export function useRevision() {
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision((r) => r + 1), []);
  useFocusEffect(invalidate);
  return { revision, invalidate };
}

export function useFolderList() {
  const repos = useRepositories();
  const { revision, invalidate } = useRevision();

  const [query, setQuery] = useState('');

  const list: FolderList = useMemo(
    () => loadFolderList(repos, { query }),
    // `revision` forces a re-read after focus / writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, query, revision],
  );

  return {
    ...list,
    query,
    setQuery,
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

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QuestionFilter>('all');

  const detail: FolderDetail | undefined = useMemo(
    () => {
      // The saved session size caps 「N問を復習」 (same value `selectFolderViewItems` uses).
      const { sessionSize } = parseReviewSettings((key) => repos.settings.get(key));
      return loadFolderDetail(repos, folderId, {
        query,
        filter,
        sessionLimit: sessionSize === 'all' ? undefined : sessionSize,
      });
    },
    // `revision` forces a re-read after focus / writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repos, folderId, query, filter, revision],
  );

  return {
    detail,
    query,
    setQuery,
    filter,
    setFilter,
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
