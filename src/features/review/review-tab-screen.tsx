import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { FolderListScreen } from '@/features/library/folder-list-screen';

import { ReviewSessionScreen } from './review-session-screen';
import { ReviewStartCard } from './review-start-card';
import { useReviewSession } from './use-review';

/**
 * 復習 tab. Figma 07 (folder list) is the tab's home, with the review entry on top; a running
 * session replaces it (Figma 10) and the tab keeps the session while the user visits other tabs.
 * Figma 08「N問を復習」opens this tab with `folderId` + `run`, which starts a folder-only session.
 */
export function ReviewTabScreen() {
  const session = useReviewSession();
  const { folderId, run, query, filter } = useLocalSearchParams<{
    folderId?: string;
    run?: string;
    query?: string;
    filter?: string;
  }>();
  const handledRun = useRef<string | undefined>(undefined);
  const { status } = session.state;
  const { start } = session;

  useEffect(() => {
    if (!folderId || !run || handledRun.current === run) return;
    handledRun.current = run;
    // A session already in progress is kept as is; the user resumes it.
    if (status === 'idle') {
      const f = filter === 'due' || filter === 'weak' ? filter : 'all';
      start({ folderId, query: query ?? '', filter: f });
    }
    router.setParams({ folderId: undefined, run: undefined, query: undefined, filter: undefined });
  }, [folderId, run, query, filter, status, start]);

  if (status !== 'idle') return <ReviewSessionScreen session={session} />;
  return <FolderListScreen header={<ReviewStartCard onStart={() => start()} refreshKey={status} />} />;
}
