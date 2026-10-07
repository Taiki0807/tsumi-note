import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';

/**
 * FSRS domain (docs/ARCHITECTURE.md §10). The only module that talks to `ts-fsrs` (v5.x):
 * everything else works with plain, serializable values (epoch ms instead of `Date`).
 *
 * Parameters are the library defaults (request_retention 0.9, fuzz off, short-term steps on),
 * so the same card + rating + time always yields the same schedule.
 */
const scheduler = fsrs();

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

const GRADES: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Current scheduling state of a question: the ts-fsrs `Card` with dates as epoch ms. */
export type FsrsCardState = {
  dueAt: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** ts-fsrs `State`: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
  lastReviewAt: number | null;
};

/** The card state *before* a review (the ts-fsrs `ReviewLog` snapshot), stored in Review History. */
export type FsrsReviewSnapshot = {
  state: number;
  dueAt: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
};

export type ScheduledReview = {
  /** State after applying the rating. */
  next: FsrsCardState;
  /** State before the rating, for the history row. */
  before: FsrsReviewSnapshot;
};

function toCard(card: FsrsCardState): Card {
  return {
    due: new Date(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReviewAt === null ? undefined : new Date(card.lastReviewAt),
  };
}

function fromCard(card: Card): FsrsCardState {
  return {
    dueAt: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReviewAt: card.last_review ? card.last_review.getTime() : null,
  };
}

/** A question that was never reviewed: due immediately (`createEmptyCard`). */
export function newCardState(nowMs: number): FsrsCardState {
  return fromCard(createEmptyCard(new Date(nowMs)));
}

/** Applies one rating at `nowMs`. Pure: no I/O, no clock access. */
export function scheduleReview(card: FsrsCardState, rating: ReviewRating, nowMs: number): ScheduledReview {
  const { card: next, log } = scheduler.next(toCard(card), new Date(nowMs), GRADES[rating]);
  return {
    next: fromCard(next),
    before: {
      state: log.state,
      dueAt: log.due.getTime(),
      stability: log.stability,
      difficulty: log.difficulty,
      scheduledDays: log.scheduled_days,
      learningSteps: log.learning_steps,
    },
  };
}

/**
 * The four possible outcomes at `nowMs`, computed with the very same `scheduleReview` that
 * `applyRating` uses when saving, so a previewed due is exactly the one stored. Pure: no I/O.
 */
export function previewReviews(card: FsrsCardState, nowMs: number): Record<ReviewRating, ScheduledReview> {
  return {
    again: scheduleReview(card, 'again', nowMs),
    hard: scheduleReview(card, 'hard', nowMs),
    good: scheduleReview(card, 'good', nowMs),
    easy: scheduleReview(card, 'easy', nowMs),
  };
}

/** A card is due when its due time has been reached (inclusive). */
export function isDue(dueAt: number, nowMs: number): boolean {
  return dueAt <= nowMs;
}
