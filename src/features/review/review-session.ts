import type { DueQuestion } from '@/db/repositories';
import type { ReviewRating } from '@/domain/fsrs';
import type { ReviewSettings } from '@/domain/review-settings';

/**
 * Review session state machine. Pure functions only: no React, no DB, no clock access (callers
 * pass `now`). Like the timer, the remaining time is derived from a timestamp
 * (`presentedAt + limitMs - now`), never from a tick counter, so Background / lock / relaunch
 * of the JS timer cannot stretch or rewind it.
 */

export type SessionItem = {
  questionId: string;
  prompt: string;
  answer: string;
  folderName: string;
  /** Not due when the session started (「すべて」「苦手」): rating records history, keeps the FSRS schedule. */
  voluntary?: boolean;
};

export type SessionOutcome = {
  questionId: string;
  rating: ReviewRating;
  timedOut: boolean;
  /** Counted as correct: rated hard / good / easy within the time limit. */
  correct: boolean;
  nextDueAt: number;
};

export type ActiveSession = {
  status: 'active';
  items: SessionItem[];
  index: number;
  step: 'question' | 'answer';
  /** Idempotency key of the current question's review (becomes the review_history id). */
  attemptId: string;
  presentedAt: number;
  /** `null` = no time limit. */
  limitMs: number | null;
  /** Time spent before the answer was shown. Frozen once `step` is `answer`. */
  elapsedMs: number | null;
  timedOut: boolean;
  outcomes: SessionOutcome[];
  /** Questions that disappeared (deleted) mid-session and were skipped. */
  skipped: number;
};

export type DoneSession = {
  status: 'done';
  total: number;
  outcomes: SessionOutcome[];
  skipped: number;
};

export type ReviewSessionState = { status: 'idle' } | ActiveSession | DoneSession;

export const IDLE_SESSION: ReviewSessionState = { status: 'idle' };

/** `at` given: questions not due at `at` become voluntary reviews (FSRS schedule untouched). */
export function toSessionItems(due: DueQuestion[], at?: number): SessionItem[] {
  return due.map(({ question, folderName, card }) => ({
    questionId: question.id,
    prompt: question.prompt,
    answer: question.answer,
    folderName,
    voluntary: at !== undefined && card.dueAt > at,
  }));
}

/** Starts a session over `items` (already limited to the configured size). Empty = stays idle. */
export function startSession(
  items: SessionItem[],
  settings: Pick<ReviewSettings, 'timeLimitEnabled' | 'timeLimitSeconds'>,
  now: number,
  newId: () => string,
): ReviewSessionState {
  if (items.length === 0) return IDLE_SESSION;
  return {
    status: 'active',
    items,
    index: 0,
    step: 'question',
    attemptId: newId(),
    presentedAt: now,
    limitMs: settings.timeLimitEnabled ? settings.timeLimitSeconds * 1000 : null,
    elapsedMs: null,
    timedOut: false,
    outcomes: [],
    skipped: 0,
  };
}

export function currentItem(state: ActiveSession): SessionItem {
  return state.items[state.index]!;
}

/** Remaining ms of the time limit, or `null` when there is none. Stops once the answer is shown. */
export function remainingMs(state: ActiveSession, now: number): number | null {
  if (state.limitMs === null) return null;
  const elapsed = state.step === 'answer' ? (state.elapsedMs ?? 0) : now - state.presentedAt;
  return Math.max(0, state.limitMs - Math.max(0, elapsed));
}

/**
 * Applies the time limit: past the deadline the question times out and the answer is revealed.
 * Returns the same object when nothing changed (cheap for React state).
 */
export function tick(state: ReviewSessionState, now: number): ReviewSessionState {
  if (state.status !== 'active' || state.step !== 'question' || state.limitMs === null) return state;
  if (now - state.presentedAt < state.limitMs) return state;
  return { ...state, step: 'answer', timedOut: true, elapsedMs: state.limitMs };
}

/** 答えを見る: stops the timer. If the deadline already passed, it counts as a timeout. */
export function revealAnswer(state: ReviewSessionState, now: number): ReviewSessionState {
  if (state.status !== 'active' || state.step !== 'question') return state;
  const timedOutState = tick(state, now);
  if (timedOutState !== state) return timedOutState;
  return { ...state, step: 'answer', elapsedMs: Math.max(0, now - state.presentedAt) };
}

/** Ratings are only accepted once the answer is visible. */
export function canRate(state: ReviewSessionState): state is ActiveSession {
  return state.status === 'active' && state.step === 'answer';
}

/**
 * Moves on after the current question was rated (`outcome`) or turned out to be gone (`null`).
 * Ends the session after the last question.
 */
export function advance(
  state: ActiveSession,
  outcome: SessionOutcome | null,
  now: number,
  newId: () => string,
): ReviewSessionState {
  const outcomes = outcome ? [...state.outcomes, outcome] : state.outcomes;
  const skipped = outcome ? state.skipped : state.skipped + 1;
  const index = state.index + 1;
  if (index >= state.items.length) {
    return { status: 'done', total: state.items.length, outcomes, skipped };
  }
  return {
    ...state,
    index,
    step: 'question',
    attemptId: newId(),
    presentedAt: now,
    elapsedMs: null,
    timedOut: false,
    outcomes,
    skipped,
  };
}

export function makeOutcome(
  questionId: string,
  rating: ReviewRating,
  timedOut: boolean,
  nextDueAt: number,
): SessionOutcome {
  return { questionId, rating, timedOut, correct: rating !== 'again' && !timedOut, nextDueAt };
}

export type SessionSummary = {
  solved: number;
  correct: number;
  timedOut: number;
  /** 0-100, rounded; 0 when nothing was solved. */
  accuracyPercent: number;
  /** Earliest next due among the reviewed questions. */
  nextDueAt: number | undefined;
};

export function summarize(outcomes: SessionOutcome[]): SessionSummary {
  const solved = outcomes.length;
  const correct = outcomes.filter((o) => o.correct).length;
  return {
    solved,
    correct,
    timedOut: outcomes.filter((o) => o.timedOut).length,
    accuracyPercent: solved === 0 ? 0 : Math.round((correct / solved) * 100),
    nextDueAt: solved === 0 ? undefined : Math.min(...outcomes.map((o) => o.nextDueAt)),
  };
}

/** "10分後" / "3時間後" / "5日後" relative to `now`; "まもなく" when already due. */
export function formatNextDue(dueAt: number, now: number): string {
  const minutes = Math.round((dueAt - now) / 60_000);
  if (minutes < 1) return 'まもなく';
  if (minutes < 60) return `${minutes}分後`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間後`;
  return `${Math.round(hours / 24)}日後`;
}

/** mm:ss for the countdown (rounded up so 0:00 only shows at the deadline). */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
