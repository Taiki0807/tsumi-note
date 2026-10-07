import type { Repositories } from '@/db/repositories';
import {
  parseReviewSettings,
  serializeReviewSettings,
  validateReviewSettings,
  type ReviewSettings,
} from '@/domain/review-settings';
import type { ReviewRating } from '@/domain/fsrs';

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

/** Use case: due questions (nearest due first), capped by the session size. Never padded. */
export function selectSessionItems(repos: ReviewRepos, settings: ReviewSettings, now: number): SessionItem[] {
  const limit = settings.sessionSize === 'all' ? undefined : settings.sessionSize;
  return toSessionItems(repos.review.listDue({ at: now, limit }));
}

/**
 * Use case: rate the current question. Persists FSRS state + history in one transaction and
 * returns the outcome to show in the summary, or `null` when the question no longer exists.
 */
export function submitRating(
  repos: ReviewRepos,
  session: ActiveSession,
  rating: ReviewRating,
  now: number,
): SessionOutcome | null {
  const item = session.items[session.index]!;
  const result = repos.review.applyRating({
    attemptId: session.attemptId,
    questionId: item.questionId,
    rating,
    timedOut: session.timedOut,
    elapsedMs: session.elapsedMs,
  });
  if (result.status === 'question-missing') return null;
  // A duplicate means this attempt was already stored (double tap): reuse the stored schedule.
  const nextDueAt = result.card?.dueAt ?? now;
  return makeOutcome(item.questionId, rating, session.timedOut, nextDueAt);
}
