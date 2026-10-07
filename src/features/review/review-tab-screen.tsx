import { FolderListScreen } from '@/features/library/folder-list-screen';

import { ReviewSessionScreen } from './review-session-screen';
import { ReviewStartCard } from './review-start-card';
import { useReviewSession } from './use-review';

/**
 * 復習 tab. Figma 07 (folder list) is the tab's home, with the review entry on top; a running
 * session replaces it (Figma 10) and the tab keeps the session while the user visits other tabs.
 */
export function ReviewTabScreen() {
  const session = useReviewSession();
  if (session.state.status !== 'idle') return <ReviewSessionScreen session={session} />;
  return (
    <FolderListScreen
      header={<ReviewStartCard onStart={session.start} refreshKey={session.state.status} />}
    />
  );
}
