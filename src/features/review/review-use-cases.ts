import type { Repositories } from '@/db/repositories';
import {
  parseReviewSettings,
  serializeReviewSettings,
  validateReviewSettings,
  type ReviewSettings,
} from '@/domain/review-settings';
import type { ReviewRating } from '@/domain/fsrs';
import { formatInterval } from '@/domain/review-interval';
import { loadFolderDetail } from '@/features/library/library-use-cases';
import type { QuestionFilter } from '@/features/library/question-list';

import {
  makeOutcome,
  toSessionItems,
  type ActiveSession,
  type SessionItem,
  type SessionOutcome,
} from './review-session';

type ReviewRepos = Pick<Repositories, 'review' | 'settings'>;

export function loadReviewSettings({ settings }: Pick<Repositories, 'settings'>): ReviewSettings {
  return parseReviewSettings((key) => settings.get(key));
}

/** Persists valid settings; throws on invalid input so nothing half-valid is stored. */
export function saveReviewSettings({ settings }: Pick<Repositories, 'settings'>, next: ReviewSettings): void {
  if (!validateReviewSettings(next)) throw new Error('Invalid review settings');
  for (const [key, value] of Object.entries(serializeReviewSettings(next))) settings.set(key, value);
}

export type ReviewOverview = {
  /** `no-questions`: nothing has been created yet. `nothing-due`: questions exist, none due now. */
  status: 'no-questions' | 'nothing-due' | 'ready';
  dueCount: number;
  /** Questions the next session will contain (due count capped by the session size setting). */
  sessionCount: number;
  nextDueAt: number | undefined;
  settings: ReviewSettings;
  /** The time the overview was computed at (for relative "next due" text). */
  at: number;
};

/** Use case: what the review home shows. */
export function loadReviewOverview(repos: ReviewRepos, now: number): ReviewOverview {
  const settings = loadReviewSettings(repos);
  const dueCount = repos.review.countDue(now);
  const sessionCount = settings.sessionSize === 'all' ? dueCount : Math.min(dueCount, settings.sessionSize);
  const status =
    dueCount > 0 ? 'ready' : repos.review.countReviewable() === 0 ? 'no-questions' : 'nothing-due';
  return {
    status,
    dueCount,
    sessionCount,
    nextDueAt: status === 'nothing-due' ? repos.review.nextDueAfter(now) : undefined,
    settings,
    at: now,
  };
}

/**
 * Use case: due questions (nearest due first), capped by the session size. Never padded.
 * `folderId` limits the session to one folder (Figma 08「N問を復習」).
 */
export function selectSessionItems(
  repos: ReviewRepos,
  settings: ReviewSettings,
  now: number,
  folderId?: string,
): SessionItem[] {
  const limit = settings.sessionSize === 'all' ? undefined : settings.sessionSize;
  return toSessionItems(repos.review.listDue({ at: now, limit, folderId }));
}

/**
 * Use case: the questions currently shown in a folder's question management (search AND filter),
 * due or not. Not capped by the session size, so it always matches the 「N問を復習」 count.
 */
export function selectFolderViewItems(
  repos: ReviewRepos & Pick<Repositories, 'folders' | 'questions'>,
  folderId: string,
  view: { query?: string; filter?: QuestionFilter },
  now: number,
): SessionItem[] {
  const detail = loadFolderDetail(repos, folderId, { ...view, now });
  if (!detail) return [];
  return toSessionItems(repos.review.listByIds(detail.rows.map((r) => r.question.id)), now);
}

export type RatingPreview = {
  /** The time the candidates were computed at; pass it to `submitRating` as `reviewedAt`. */
  at: number;
  /** Time until the next due for each rating, e.g. "10分". */
  intervals: Record<ReviewRating, string>;
};

/**
 * Use case: next-review interval for each of the four ratings (shown on the rating buttons).
 * Read-only. `null` for a voluntary review (its schedule is not updated, so there is nothing to
 * promise) or when the question is gone.
 */
export function previewRatings(repos: ReviewRepos, session: ActiveSession, at: number): RatingPreview | null {
  const item = session.items[session.index]!;
  if (item.voluntary) return null;
  const next = repos.review.previewRatings(item.questionId, at);
  if (!next) return null;
  const label = (rating: ReviewRating) => formatInterval(next[rating].dueAt - at);
  return {
    at,
    intervals: { again: label('again'), hard: label('hard'), good: label('good'), easy: label('easy') },
  };
}

/**
 * Use case: rate the current question. Persists FSRS state + history in one transaction and
 * returns the outcome to show in the summary, or `null` when the question no longer exists.
 * `reviewedAt` = the preview time, so the stored due matches what the button showed.
 */
export function submitRating(
  repos: ReviewRepos,
  session: ActiveSession,
  rating: ReviewRating,
  now: number,
  reviewedAt?: number,
): SessionOutcome | null {
  const item = session.items[session.index]!;
  const result = repos.review.applyRating({
    attemptId: session.attemptId,
    questionId: item.questionId,
    rating,
    timedOut: session.timedOut,
    elapsedMs: session.elapsedMs,
    keepSchedule: item.voluntary,
    reviewedAt,
  });
  if (result.status === 'question-missing') return null;
  // A duplicate means this attempt was already stored (double tap): reuse the stored schedule.
  const nextDueAt = result.card?.dueAt ?? now;
  return makeOutcome(item.questionId, rating, session.timedOut, nextDueAt);
}
