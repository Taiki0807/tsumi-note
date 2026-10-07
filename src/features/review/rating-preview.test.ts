import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import { previewReviews, REVIEW_RATINGS } from '@/domain/fsrs';
import { formatInterval } from '@/domain/review-interval';
import { DEFAULT_REVIEW_SETTINGS } from '@/domain/review-settings';

import { revealAnswer, startSession, type ActiveSession } from './review-session';
import { previewRatings, selectSessionItems, submitRating } from './review-use-cases';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function setup() {
  const { deps, tick } = createTestDeps(createTestDatabase());
  const repos = createRepositories(deps);
  const folder = repos.folders.create({ name: 'F' });
  const question = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
  return { repos, tick, question };
}

function answerSession(repos: ReturnType<typeof createRepositories>, at: number): ActiveSession {
  const settings = { ...DEFAULT_REVIEW_SETTINGS, timeLimitEnabled: false };
  const started = startSession(selectSessionItems(repos, settings, at), settings, at, () => 'attempt-1');
  return revealAnswer(started, at + 1_000) as ActiveSession;
}

function tableOf(repos: ReturnType<typeof createRepositories>, id: string, at: number) {
  return repos.review.previewRatings(id, at)!;
}

describe('formatInterval', () => {
  it('uses minutes, hours, days, weeks, months and years from one rule set', () => {
    expect(formatInterval(0)).toBe('1分未満');
    expect(formatInterval(20_000)).toBe('1分未満');
    expect(formatInterval(MIN)).toBe('1分');
    expect(formatInterval(10 * MIN)).toBe('10分');
    expect(formatInterval(59 * MIN)).toBe('59分');
    expect(formatInterval(2 * HOUR)).toBe('2時間');
    expect(formatInterval(6 * HOUR)).toBe('6時間');
    expect(formatInterval(DAY)).toBe('1日');
    expect(formatInterval(3 * DAY)).toBe('3日');
    expect(formatInterval(13 * DAY)).toBe('13日');
    expect(formatInterval(14 * DAY)).toBe('2週間');
    expect(formatInterval(29 * DAY)).toBe('4週間');
    expect(formatInterval(30 * DAY)).toBe('1か月');
    expect(formatInterval(200 * DAY)).toBe('7か月');
    expect(formatInterval(365 * DAY)).toBe('1年');
    expect(formatInterval(800 * DAY)).toBe('2年');
  });

  it('never shows a rounded-up unit boundary like 60分 or 24時間', () => {
    expect(formatInterval(59.6 * MIN)).toBe('1時間');
    expect(formatInterval(23.9 * HOUR)).toBe('1日');
    expect(formatInterval(13.6 * DAY)).toBe('2週間');
  });
});

describe('rating preview', () => {
  it('shows an interval for each of again / hard / good / easy of a new question', () => {
    const { repos, tick } = setup();
    tick();
    const session = answerSession(repos, 5_000);
    const preview = previewRatings(repos, session, 6_000)!;
    expect(Object.keys(preview.intervals)).toEqual([...REVIEW_RATINGS]);
    // Learning steps (ts-fsrs defaults): again 1分, hard ~6分, good 10分; easy graduates to days.
    expect(preview.intervals.again).toBe('1分');
    expect(preview.intervals.good).toBe('10分');
    expect(preview.intervals.easy).toMatch(/日|週間/);
    const dues = REVIEW_RATINGS.map((r) => tableOf(repos, session.items[0]!.questionId, 6_000)[r].dueAt);
    expect([...dues].sort((a, b) => a - b)).toEqual(dues);
  });

  it('for a reviewed question uses its stored card (days / weeks / months)', () => {
    const { repos, tick, question } = setup();
    tick();
    repos.review.applyRating({
      attemptId: 'first',
      questionId: question.id,
      rating: 'easy',
      timedOut: false,
      elapsedMs: 1,
      reviewedAt: 1_000,
    });
    const card = repos.review.getState(question.id)!;
    const at = card.dueAt;
    const table = tableOf(repos, question.id, at);
    expect(table.again.dueAt - at).toBeLessThan(DAY); // relearning step in minutes
    const labels = REVIEW_RATINGS.map((r) => formatInterval(table[r].dueAt - at));
    expect(labels[0]).toMatch(/分/);
    expect(labels[2]).toMatch(/日|週間|か月/);
    expect(labels[3]).toMatch(/日|週間|か月|年/);
    expect(table.hard.dueAt).toBeLessThanOrEqual(table.good.dueAt);
    expect(table.good.dueAt).toBeLessThanOrEqual(table.easy.dueAt);
  });

  it('matches the pure domain calculation (single source of truth)', () => {
    const { repos, tick, question } = setup();
    tick();
    const table = tableOf(repos, question.id, 9_000);
    const fresh = previewReviews(repos.review.listDue({ at: 9_000 })[0]!.card, 9_000);
    for (const r of REVIEW_RATINGS) expect(table[r]).toEqual(fresh[r].next);
  });

  it('does not write anything while previewing', () => {
    const { repos, tick, question } = setup();
    tick();
    const session = answerSession(repos, 5_000);
    previewRatings(repos, session, 6_000);
    previewRatings(repos, session, 7_000);
    expect(repos.review.getState(question.id)).toBeUndefined();
    expect(repos.review.listHistory(question.id)).toHaveLength(0);
    expect(repos.review.countDue(10_000)).toBe(1);
  });

  it.each(REVIEW_RATINGS)('stores exactly the previewed due when %s is chosen', (rating) => {
    const { repos, tick, question } = setup();
    tick();
    const session = answerSession(repos, 5_000);
    const preview = previewRatings(repos, session, 6_000)!;
    const previewedDue = repos.review.previewRatings(question.id, preview.at)![rating].dueAt;

    tick(30_000); // time passes between showing the buttons and tapping
    const outcome = submitRating(repos, session, rating, 40_000, preview.at)!;

    expect(repos.review.getState(question.id)!.dueAt).toBe(previewedDue);
    expect(outcome.nextDueAt).toBe(previewedDue);
    expect(formatInterval(previewedDue - preview.at)).toBe(preview.intervals[rating]);
    expect(repos.review.listHistory(question.id)).toHaveLength(1);
  });

  it('shows no intervals for a voluntary (not due) review whose schedule is kept', () => {
    const { repos, tick, question } = setup();
    tick();
    repos.review.applyRating({
      attemptId: 'x',
      questionId: question.id,
      rating: 'easy',
      timedOut: false,
      elapsedMs: 1,
    });
    const settings = { ...DEFAULT_REVIEW_SETTINGS, timeLimitEnabled: false };
    const items = [{ questionId: question.id, prompt: 'Q', answer: 'A', folderName: 'F', voluntary: true }];
    const session = revealAnswer(
      startSession(items, settings, 5_000, () => 'v'),
      6_000,
    ) as ActiveSession;
    expect(previewRatings(repos, session, 6_000)).toBeNull();
  });
});
