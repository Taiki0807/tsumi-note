import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import { DEFAULT_REVIEW_SETTINGS } from '@/domain/review-settings';

import {
  advance,
  canRate,
  revealAnswer,
  startSession,
  summarize,
  type ActiveSession,
} from './review-session';
import {
  loadReviewOverview,
  loadReviewSettings,
  saveReviewSettings,
  selectSessionItems,
  submitRating,
} from './review-use-cases';

function setup(file?: string) {
  const { deps, tick } = createTestDeps(createTestDatabase(file));
  return { repos: createRepositories(deps), tick };
}

function seed(repos: ReturnType<typeof createRepositories>, count: number) {
  const folder = repos.folders.list()[0] ?? repos.folders.create({ name: '韓国語' });
  return Array.from({ length: count }, (_, i) =>
    repos.questions.create({ folderId: folder.id, prompt: `Q${i + 1}`, answer: `A${i + 1}` }),
  );
}

let seq = 0;
const newId = () => `attempt-${++seq}`;
beforeEach(() => {
  seq = 0;
});

describe('review settings', () => {
  it('falls back to the defaults', () => {
    const { repos } = setup();
    expect(loadReviewSettings(repos)).toEqual(DEFAULT_REVIEW_SETTINGS);
  });

  it('saves and reloads', () => {
    const { repos } = setup();
    saveReviewSettings(repos, { timeLimitEnabled: false, timeLimitSeconds: 60, sessionSize: 20 });
    expect(loadReviewSettings(repos)).toEqual({
      timeLimitEnabled: false,
      timeLimitSeconds: 60,
      sessionSize: 20,
    });
  });

  it('refuses invalid values and ignores corrupted stored ones', () => {
    const { repos } = setup();
    expect(() => saveReviewSettings(repos, { ...DEFAULT_REVIEW_SETTINGS, sessionSize: 0 })).toThrow();
    expect(() => saveReviewSettings(repos, { ...DEFAULT_REVIEW_SETTINGS, timeLimitSeconds: 2 })).toThrow();
    repos.settings.set('review.timeLimitSeconds', 'abc');
    repos.settings.set('review.sessionSize', '-3');
    expect(loadReviewSettings(repos)).toEqual(DEFAULT_REVIEW_SETTINGS);
  });
});

describe('review overview', () => {
  it('reports no questions at all', () => {
    const { repos } = setup();
    expect(loadReviewOverview(repos, 1_000)).toMatchObject({ status: 'no-questions', dueCount: 0 });
  });

  it('reports questions that exist but are not due', () => {
    const { repos, tick } = setup();
    const [q] = seed(repos, 1);
    tick();
    repos.review.applyRating({
      attemptId: 'a',
      questionId: q!.id,
      rating: 'easy',
      timedOut: false,
      elapsedMs: 1,
    });
    const overview = loadReviewOverview(repos, 2_000);
    expect(overview.status).toBe('nothing-due');
    expect(overview.nextDueAt).toBe(repos.review.getState(q!.id)!.dueAt);
  });

  it('caps the session by the size setting without padding', () => {
    const { repos } = setup();
    seed(repos, 3);
    saveReviewSettings(repos, { ...DEFAULT_REVIEW_SETTINGS, sessionSize: 10 });
    expect(loadReviewOverview(repos, 1_000)).toMatchObject({ status: 'ready', dueCount: 3, sessionCount: 3 });
    saveReviewSettings(repos, { ...DEFAULT_REVIEW_SETTINGS, sessionSize: 2 });
    expect(loadReviewOverview(repos, 1_000)).toMatchObject({ dueCount: 3, sessionCount: 2 });
  });
});

describe('review session over SQLite', () => {
  it('limits the session size and orders by due time', () => {
    const { repos, tick } = setup();
    const qs = seed(repos, 4);
    tick();
    repos.review.applyRating({
      attemptId: 'x',
      questionId: qs[0]!.id,
      rating: 'again',
      timedOut: false,
      elapsedMs: 1,
    });
    tick(10 * 60_000);
    const settings = { ...DEFAULT_REVIEW_SETTINGS, sessionSize: 3 };
    // q0 (due again after 1 minute) is due now too, but its due time is the latest.
    expect(selectSessionItems(repos, settings, 700_000).map((i) => i.questionId)).toEqual([
      qs[1]!.id,
      qs[2]!.id,
      qs[3]!.id,
    ]);
    expect(selectSessionItems(repos, { ...settings, sessionSize: 'all' }, 700_000)).toHaveLength(4);
  });

  it('runs a whole session: show answer, rate, next question, completion, persisted state', () => {
    const { repos, tick } = setup();
    const qs = seed(repos, 3);
    tick();
    const settings = { ...DEFAULT_REVIEW_SETTINGS, timeLimitEnabled: false };
    const startAt = 5_000;
    let state = startSession(selectSessionItems(repos, settings, startAt), settings, startAt, newId);
    const ratings = ['good', 'again', 'easy'] as const;

    for (const [i, rating] of ratings.entries()) {
      const at = startAt + (i + 1) * 1_000;
      expect(state.status).toBe('active');
      state = revealAnswer(state, at);
      expect(canRate(state)).toBe(true);
      const session = state as ActiveSession;
      tick();
      const outcome = submitRating(repos, session, rating, at);
      expect(outcome).toMatchObject({ questionId: qs[i]!.id, rating });
      state = advance(session, outcome, at, newId);
    }

    expect(state.status).toBe('done');
    if (state.status !== 'done') return;
    expect(summarize(state.outcomes)).toMatchObject({ solved: 3, correct: 2, accuracyPercent: 67 });
    for (const q of qs) expect(repos.review.listHistory(q.id)).toHaveLength(1);
    expect(repos.review.getState(qs[1]!.id)!.lapses).toBe(0); // first review of a new card is not a lapse
  });

  it('does not double-process the same rating when submitted twice', () => {
    const { repos, tick } = setup();
    const [q] = seed(repos, 1);
    tick();
    const settings = { ...DEFAULT_REVIEW_SETTINGS, timeLimitEnabled: false };
    const state = revealAnswer(
      startSession(selectSessionItems(repos, settings, 5_000), settings, 5_000, newId),
      6_000,
    ) as ActiveSession;
    const a = submitRating(repos, state, 'good', 6_000);
    const b = submitRating(repos, state, 'good', 6_000);
    expect(b).toEqual(a);
    expect(repos.review.listHistory(q!.id)).toHaveLength(1);
    expect(repos.review.getState(q!.id)!.reps).toBe(1);
  });

  it('records a timeout from the session state', () => {
    const { repos, tick } = setup();
    const [q] = seed(repos, 1);
    tick();
    const settings = { ...DEFAULT_REVIEW_SETTINGS, timeLimitSeconds: 30 };
    const state = revealAnswer(
      startSession(selectSessionItems(repos, settings, 5_000), settings, 5_000, newId),
      5_000 + 31_000,
    ) as ActiveSession;
    const outcome = submitRating(repos, state, 'hard', 36_000);
    expect(outcome).toMatchObject({ timedOut: true, correct: false });
    expect(repos.review.listHistory(q!.id)[0]).toMatchObject({
      timedOut: true,
      elapsedMs: 30_000,
      rating: 'hard',
    });
  });

  it('skips a question deleted while the session was running', () => {
    const { repos, tick } = setup();
    const qs = seed(repos, 2);
    tick();
    const settings = { ...DEFAULT_REVIEW_SETTINGS, timeLimitEnabled: false };
    const state = revealAnswer(
      startSession(selectSessionItems(repos, settings, 5_000), settings, 5_000, newId),
      6_000,
    ) as ActiveSession;
    repos.questions.softDelete(qs[0]!.id);
    expect(submitRating(repos, state, 'good', 6_000)).toBeNull();
    expect(advance(state, null, 6_000, newId)).toMatchObject({ index: 1, skipped: 1 });
  });
});

describe('restart', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'tsumi-note-session-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('does not offer a rated question again after the app restarts', () => {
    const file = path.join(dir, 'app.db');
    const first = setup(file);
    const qs = seed(first.repos, 2);
    first.tick();
    first.repos.review.applyRating({
      attemptId: 'a',
      questionId: qs[0]!.id,
      rating: 'easy',
      timedOut: false,
      elapsedMs: 1,
    });
    saveReviewSettings(first.repos, { ...DEFAULT_REVIEW_SETTINGS, sessionSize: 5 });

    const second = setup(file);
    expect(loadReviewSettings(second.repos).sessionSize).toBe(5);
    expect(
      selectSessionItems(second.repos, loadReviewSettings(second.repos), 5_000).map((i) => i.questionId),
    ).toEqual([qs[1]!.id]);
  });
});
