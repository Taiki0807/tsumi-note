// The time zone is pinned to Asia/Tokyo by jest.global-setup.js.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import type { ReviewRating } from '@/domain/fsrs';

import { loadWeeklyRecord } from './load-weekly-record';
import {
  buildUnderstanding,
  formatCorrectRate,
  formatShortWeekRange,
  startOfWeek,
  type AnswerLike,
} from './records-logic';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const ans = (result: AnswerLike['result'], answeredAt: number): AnswerLike => ({ result, answeredAt });

// 2026-09-07 is a Monday.
const WEEK = local(2026, 9, 7);

describe('buildUnderstanding (pure)', () => {
  it('has no rate (not 0%) when nothing was answered', () => {
    const u = buildUnderstanding([], WEEK);
    expect(u).toEqual({ answerCount: 0, correctCount: 0, timeoutCount: 0, correctRate: null });
    expect(formatCorrectRate(u.correctRate)).toBe('—');
  });

  it('distinguishes 0% (answered, none correct) from no data', () => {
    const u = buildUnderstanding([ans('incorrect', local(2026, 9, 8))], WEEK);
    expect(u.correctRate).toBe(0);
    expect(formatCorrectRate(u.correctRate)).toBe('0%');
  });

  it('handles one and several answers; timeout counts as an answer but not as correct', () => {
    expect(buildUnderstanding([ans('correct', local(2026, 9, 8))], WEEK).correctRate).toBe(1);
    const u = buildUnderstanding(
      [
        ans('correct', local(2026, 9, 7, 9)),
        ans('correct', local(2026, 9, 8, 9)),
        ans('correct', local(2026, 9, 9, 9)),
        ans('incorrect', local(2026, 9, 10, 9)),
        ans('timeout', local(2026, 9, 11, 9)),
      ],
      WEEK,
    );
    expect(u).toMatchObject({ answerCount: 5, correctCount: 3, timeoutCount: 1 });
    expect(u.correctRate).toBeCloseTo(0.6);
    expect(formatCorrectRate(u.correctRate)).toBe('60%');
  });

  it('uses the local Monday-Sunday week of the study time (boundaries)', () => {
    const u = buildUnderstanding(
      [
        ans('correct', local(2026, 9, 6, 23, 59)), // Sunday of the previous week
        ans('incorrect', local(2026, 9, 7, 0, 0)), // Monday 00:00 → this week
        ans('correct', local(2026, 9, 13, 23, 59)), // Sunday 23:59 → this week
        ans('correct', local(2026, 9, 14, 0, 0)), // next Monday → next week
      ],
      WEEK,
    );
    expect(u.answerCount).toBe(2);
    expect(u.correctCount).toBe(1);
    expect(startOfWeek(local(2026, 9, 13, 23, 59))).toBe(WEEK);
  });

  it('works across a month and a year boundary', () => {
    const monthWeek = local(2026, 8, 31); // Mon 8/31 – Sun 9/6
    const m = buildUnderstanding(
      [
        ans('correct', local(2026, 8, 31, 8)),
        ans('incorrect', local(2026, 9, 6, 22)),
        ans('correct', local(2026, 9, 7)),
      ],
      monthWeek,
    );
    expect(m.answerCount).toBe(2);
    expect(formatShortWeekRange(monthWeek)).toBe('8/31–9/6');

    const yearWeek = local(2026, 12, 28); // Mon 12/28 – Sun 1/3
    const y = buildUnderstanding(
      [
        ans('correct', local(2026, 12, 31, 23, 59)),
        ans('incorrect', local(2027, 1, 3, 12)),
        ans('correct', local(2027, 1, 4)),
      ],
      yearWeek,
    );
    expect(y.answerCount).toBe(2);
    expect(formatShortWeekRange(yearWeek)).toBe('12/28–1/3');
  });

  it('uses local time, not UTC, for the week edge', () => {
    // Mon 2026-09-07 00:30 JST is still Sunday in UTC; it must count for the week starting 9/7.
    expect(buildUnderstanding([ans('correct', local(2026, 9, 7, 0, 30))], WEEK).answerCount).toBe(1);
    expect(
      buildUnderstanding([ans('correct', local(2026, 9, 7, 0, 30))], local(2026, 8, 31)).answerCount,
    ).toBe(0);
  });
});

describe('今週の理解度 from SQLite (Phase 5 → 学習記録)', () => {
  function setup(file?: string) {
    const { deps } = createTestDeps(createTestDatabase(file));
    const repos = createRepositories(deps);
    return { repos };
  }
  let n = 0;
  const rate = (
    repos: ReturnType<typeof setup>['repos'],
    questionId: string,
    rating: ReviewRating,
    at: number,
    timedOut = false,
  ) =>
    repos.review.applyRating({
      attemptId: `a-${++n}`,
      questionId,
      rating,
      timedOut,
      elapsedMs: 1000,
      reviewedAt: at,
    });

  it('is empty for an empty database, then re-aggregates right after a rating', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: '韓国語' });
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    expect(loadWeeklyRecord(repos, WEEK).understanding.correctRate).toBeNull();

    rate(repos, q.id, 'good', local(2026, 9, 8, 9));
    expect(loadWeeklyRecord(repos, WEEK).understanding).toMatchObject({
      answerCount: 1,
      correctCount: 1,
      correctRate: 1,
    });
  });

  it('counts again as incorrect, hard/good/easy as correct, and a timeout apart', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'F' });
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    const t = (h: number) => local(2026, 9, 8, h);
    rate(repos, q.id, 'again', t(9));
    rate(repos, q.id, 'hard', t(10));
    rate(repos, q.id, 'good', t(11));
    rate(repos, q.id, 'easy', t(12));
    rate(repos, q.id, 'good', t(13), true); // timed out: not correct, not incorrect

    expect(loadWeeklyRecord(repos, WEEK).understanding).toMatchObject({
      answerCount: 5,
      correctCount: 3,
      timeoutCount: 1,
      correctRate: 0.6,
    });
  });

  it('only reads the selected week and respects the folder filter', () => {
    const { repos } = setup();
    const a = repos.folders.create({ name: 'A' });
    const b = repos.folders.create({ name: 'B' });
    const qa = repos.questions.create({ folderId: a.id, prompt: 'Q', answer: 'A' });
    const qb = repos.questions.create({ folderId: b.id, prompt: 'Q', answer: 'A' });
    rate(repos, qa.id, 'again', local(2026, 9, 1, 9)); // previous week
    rate(repos, qa.id, 'good', local(2026, 9, 8, 9));
    rate(repos, qb.id, 'again', local(2026, 9, 9, 9));
    rate(repos, qa.id, 'again', local(2026, 9, 14, 0, 0)); // next week

    expect(loadWeeklyRecord(repos, WEEK).understanding).toMatchObject({ answerCount: 2, correctRate: 0.5 });
    expect(loadWeeklyRecord(repos, WEEK, a.id).understanding).toMatchObject({
      answerCount: 1,
      correctRate: 1,
    });
    expect(loadWeeklyRecord(repos, WEEK, b.id).understanding).toMatchObject({
      answerCount: 1,
      correctRate: 0,
    });
    // The previous week is computed the same way by selecting that week.
    expect(loadWeeklyRecord(repos, local(2026, 8, 31)).understanding).toMatchObject({
      answerCount: 1,
      correctRate: 0,
    });
  });

  it('ignores answers of deleted questions', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'F' });
    const keep = repos.questions.create({ folderId: folder.id, prompt: 'K', answer: 'A' });
    const gone = repos.questions.create({ folderId: folder.id, prompt: 'G', answer: 'A' });
    rate(repos, keep.id, 'good', local(2026, 9, 8, 9));
    rate(repos, gone.id, 'again', local(2026, 9, 8, 10));
    repos.questions.softDelete(gone.id);
    expect(loadWeeklyRecord(repos, WEEK).understanding).toMatchObject({ answerCount: 1, correctRate: 1 });
  });

  describe('after an app restart', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'tsumi-note-understanding-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('gives the same numbers from a fresh repository on the same file', () => {
      const file = path.join(dir, 'app.db');
      const first = setup(file);
      const folder = first.repos.folders.create({ name: 'F' });
      const q = first.repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
      rate(first.repos, q.id, 'good', local(2026, 9, 8, 9));
      rate(first.repos, q.id, 'again', local(2026, 9, 8, 10));
      const before = loadWeeklyRecord(first.repos, WEEK).understanding;

      const second = setup(file);
      expect(loadWeeklyRecord(second.repos, WEEK).understanding).toEqual(before);
      expect(before).toMatchObject({ answerCount: 2, correctRate: 0.5 });
    });
  });
});
