// The time zone is pinned to Asia/Tokyo by jest.global-setup.js.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import type { ReviewRating } from '@/domain/fsrs';

import { loadWeeklyRecord } from './load-weekly-record';
import { buildNeedsReview, formatNeedsReviewDetail } from './records-logic';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
// 2026-09-07 is a Monday.
const WEEK = local(2026, 9, 7);

type Result = 'correct' | 'incorrect' | 'timeout';
const ans = (questionId: string, result: Result, answeredAt: number) => ({
  questionId,
  prompt: `Q-${questionId}`,
  result,
  answeredAt,
});

describe('buildNeedsReview (pure)', () => {
  it('is null when nothing was answered or nothing was incorrect', () => {
    expect(buildNeedsReview([], WEEK)).toBeNull();
    expect(buildNeedsReview([ans('a', 'correct', local(2026, 9, 8))], WEEK)).toBeNull();
  });

  it('picks the highest error rate and formats it like Figma 「誤答率 75%（6 / 8回）」', () => {
    const answers = [
      ...[1, 2, 3, 4, 5, 6].map((h) => ans('a', 'incorrect', local(2026, 9, 8, h))),
      ...[7, 8].map((h) => ans('a', 'correct', local(2026, 9, 8, h))),
      ans('b', 'incorrect', local(2026, 9, 9, 1)),
      ans('b', 'correct', local(2026, 9, 9, 2)),
    ];
    const top = buildNeedsReview(answers, WEEK);
    expect(top).toMatchObject({ questionId: 'a', incorrectCount: 6, attemptCount: 8, incorrectRate: 0.75 });
    expect(formatNeedsReviewDetail(top!)).toBe('誤答率 75%（6 / 8回）');
  });

  it('keeps timeouts in the denominator but never counts them as incorrect', () => {
    const top = buildNeedsReview(
      [
        ans('a', 'incorrect', local(2026, 9, 8, 1)),
        ans('a', 'timeout', local(2026, 9, 8, 2)),
        ans('b', 'timeout', local(2026, 9, 8, 3)),
      ],
      WEEK,
    );
    expect(top).toMatchObject({ questionId: 'a', incorrectCount: 1, attemptCount: 2, incorrectRate: 0.5 });
  });

  it('breaks ties by more incorrect answers, then more attempts', () => {
    const t = (h: number) => local(2026, 9, 8, h);
    const top = buildNeedsReview(
      [
        ans('a', 'incorrect', t(1)),
        ans('a', 'correct', t(2)),
        ans('b', 'incorrect', t(3)),
        ans('b', 'incorrect', t(4)),
        ans('b', 'correct', t(5)),
        ans('b', 'correct', t(6)),
      ],
      WEEK,
    );
    expect(top?.questionId).toBe('b');
  });

  it('only uses the local Monday-Sunday week (boundaries, month and year rollover)', () => {
    const edge = [
      ans('prev', 'incorrect', local(2026, 9, 6, 23, 59)),
      ans('in1', 'incorrect', local(2026, 9, 7, 0, 0)),
      ans('in2', 'incorrect', local(2026, 9, 13, 23, 59)),
      ans('next', 'incorrect', local(2026, 9, 14, 0, 0)),
    ];
    expect(buildNeedsReview(edge.slice(0, 1), WEEK)).toBeNull();
    expect(buildNeedsReview(edge.slice(3), WEEK)).toBeNull();
    expect(buildNeedsReview(edge.slice(1, 3), WEEK)?.attemptCount).toBe(1);
    // Mon 8/31 – Sun 9/6 crosses a month; Mon 12/28 – Sun 1/3 crosses a year.
    expect(
      buildNeedsReview([ans('m', 'incorrect', local(2026, 9, 6, 22))], local(2026, 8, 31)),
    ).not.toBeNull();
    expect(
      buildNeedsReview([ans('y', 'incorrect', local(2027, 1, 3, 22))], local(2026, 12, 28)),
    ).not.toBeNull();
    expect(buildNeedsReview([ans('y', 'incorrect', local(2027, 1, 4, 0))], local(2026, 12, 28))).toBeNull();
  });
});

describe('今週の要復習 from SQLite', () => {
  function setup(file?: string) {
    const { deps } = createTestDeps(createTestDatabase(file));
    return { repos: createRepositories(deps) };
  }
  let n = 0;
  const rate = (
    repos: ReturnType<typeof setup>['repos'],
    questionId: string,
    rating: ReviewRating,
    at: number,
  ) =>
    repos.review.applyRating({
      attemptId: `n-${++n}`,
      questionId,
      rating,
      timedOut: false,
      elapsedMs: 1000,
      reviewedAt: at,
    });

  it('is empty at first, then updates right after a rating (no restart)', () => {
    const { repos } = setup();
    const f = repos.folders.create({ name: '韓国語' });
    const q = repos.questions.create({ folderId: f.id, prompt: '꾸준히', answer: 'こつこつ' });
    expect(loadWeeklyRecord(repos, WEEK).needsReview).toBeNull();

    rate(repos, q.id, 'again', local(2026, 9, 8, 9));
    expect(loadWeeklyRecord(repos, WEEK).needsReview).toMatchObject({
      questionId: q.id,
      prompt: '꾸준히',
      incorrectCount: 1,
      attemptCount: 1,
    });
  });

  it('ignores deleted questions and deleted folders, other weeks, and respects the folder filter', () => {
    const { repos } = setup();
    const a = repos.folders.create({ name: 'A' });
    const b = repos.folders.create({ name: 'B' });
    const qa = repos.questions.create({ folderId: a.id, prompt: 'QA', answer: 'x' });
    const qb = repos.questions.create({ folderId: b.id, prompt: 'QB', answer: 'x' });
    const gone = repos.questions.create({ folderId: a.id, prompt: 'GONE', answer: 'x' });
    rate(repos, qa.id, 'again', local(2026, 9, 8, 9));
    rate(repos, qa.id, 'good', local(2026, 9, 8, 10));
    rate(repos, qb.id, 'again', local(2026, 9, 9, 9));
    rate(repos, gone.id, 'again', local(2026, 9, 9, 10));
    rate(repos, qb.id, 'again', local(2026, 9, 14)); // next week
    repos.questions.softDelete(gone.id);

    expect(loadWeeklyRecord(repos, WEEK).needsReview?.questionId).toBe(qb.id);
    expect(loadWeeklyRecord(repos, WEEK, a.id).needsReview?.questionId).toBe(qa.id);
    repos.folders.softDelete(b.id);
    expect(loadWeeklyRecord(repos, WEEK).needsReview?.questionId).toBe(qa.id);
  });

  it('gives the same result from a fresh repository on the same file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tsumi-note-needs-review-'));
    try {
      const file = path.join(dir, 'app.db');
      const first = setup(file);
      const f = first.repos.folders.create({ name: 'F' });
      const q = first.repos.questions.create({ folderId: f.id, prompt: 'Q', answer: 'A' });
      rate(first.repos, q.id, 'again', local(2026, 9, 8, 9));
      const before = loadWeeklyRecord(first.repos, WEEK).needsReview;
      expect(before).not.toBeNull();
      expect(loadWeeklyRecord(setup(file).repos, WEEK).needsReview).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
