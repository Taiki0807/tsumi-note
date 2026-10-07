import { createRepositories } from '@/db/repositories';
import { createTestDeps } from '@/db/test-utils';
import { loadFolderDetail } from '@/features/library/library-use-cases';

import { DEFAULT_REVIEW_SETTINGS } from '@/domain/review-settings';

import { loadReviewSettings, saveReviewSettings, selectFolderViewItems } from './review-use-cases';

const NOW = 1_000;

/**
 * Folder "f": apple (due) / banana (not due, 1 attempt) / cherry (not due, weak: 3 attempts, 2 wrong).
 * The clock is fixed at NOW, so a question rated once is scheduled into the future.
 */
function seed() {
  const { deps } = createTestDeps();
  const repos = createRepositories(deps);
  const folder = repos.folders.create({ name: 'f' });
  const make = (prompt: string, answer: string) =>
    repos.questions.create({ folderId: folder.id, prompt, answer });
  const apple = make('apple', 'りんご');
  const banana = make('banana', 'バナナ');
  const cherry = make('cherry', 'さくらんぼ');
  const rate = (id: string, q: { id: string }, rating: 'again' | 'good', keepSchedule = false) =>
    repos.review.applyRating({
      attemptId: id,
      questionId: q.id,
      rating,
      timedOut: false,
      elapsedMs: 1,
      keepSchedule,
    });
  rate('b1', banana, 'good');
  rate('c1', cherry, 'again');
  rate('c2', cherry, 'again');
  rate('c3', cherry, 'good');
  return { repos, folder, apple, banana, cherry, rate };
}

type Seed = ReturnType<typeof seed>;

const names = (s: Seed, view: { query?: string; filter?: 'all' | 'due' | 'weak' }) =>
  selectFolderViewItems(s.repos, s.folder.id, view, NOW)
    .map((i) => i.prompt)
    .sort();
const buttonCount = (s: Seed, view: { query?: string; filter?: 'all' | 'due' | 'weak' }) =>
  loadFolderDetail(s.repos, s.folder.id, { ...view, now: NOW })!.reviewCount;

describe('folder review follows the question list', () => {
  it('すべて -> every question regardless of due', () => {
    const s = seed();
    expect(names(s, { filter: 'all' })).toEqual(['apple', 'banana', 'cherry']);
  });

  it('復習待ち -> only due questions', () => {
    const s = seed();
    expect(names(s, { filter: 'due' })).toEqual(['apple']);
  });

  it('苦手 -> only weak questions', () => {
    const s = seed();
    expect(names(s, { filter: 'weak' })).toEqual(['cherry']);
  });

  it('search AND filter', () => {
    const s = seed();
    expect(names(s, { query: 'an', filter: 'all' })).toEqual(['banana']);
    expect(names(s, { query: 'an', filter: 'due' })).toEqual([]);
    expect(names(s, { query: 'さくら', filter: 'weak' })).toEqual(['cherry']);
    expect(names(s, { query: 'apple', filter: 'weak' })).toEqual([]);
  });

  it('button count equals the number of questions started, and changes with filter / search', () => {
    const s = seed();
    for (const view of [
      { filter: 'all' as const },
      { filter: 'due' as const },
      { filter: 'weak' as const },
      { query: 'an', filter: 'all' as const },
      { query: 'e', filter: 'due' as const },
    ]) {
      expect(buttonCount(s, view)).toBe(selectFolderViewItems(s.repos, s.folder.id, view, NOW).length);
    }
    expect(buttonCount(s, { filter: 'all' })).toBe(3);
    expect(buttonCount(s, { filter: 'due' })).toBe(1);
    expect(buttonCount(s, { filter: 'weak' })).toBe(1);
    expect(buttonCount(s, { query: 'an', filter: 'all' })).toBe(1);
  });

  it('starts nothing when no question matches', () => {
    const s = seed();
    expect(buttonCount(s, { query: '該当なし' })).toBe(0);
    expect(names(s, { query: '該当なし' })).toEqual([]);
  });

  it('excludes deleted questions and deleted folders', () => {
    const s = seed();
    s.repos.questions.softDelete(s.apple.id);
    expect(names(s, { filter: 'all' })).toEqual(['banana', 'cherry']);
    expect(buttonCount(s, { filter: 'all' })).toBe(2);
    s.repos.folders.softDelete(s.folder.id);
    expect(names(s, { filter: 'all' })).toEqual([]);
  });
});

describe('folder review respects the saved session size', () => {
  function seedMany(total: number, size: number | 'all') {
    const { deps } = createTestDeps();
    const repos = createRepositories(deps);
    const folder = repos.folders.create({ name: 'f' });
    for (let i = 0; i < total; i++) {
      repos.questions.create({ folderId: folder.id, prompt: `q${i}`, answer: `a${i}` });
    }
    saveReviewSettings(repos, { ...DEFAULT_REVIEW_SETTINGS, sessionSize: size });
    return { repos, folder };
  }
  type Many = ReturnType<typeof seedMany>;
  type View = { query?: string; filter?: 'all' | 'due' | 'weak' };
  const started = (s: Many, view: View = {}) => selectFolderViewItems(s.repos, s.folder.id, view, NOW).length;
  const button = (s: Many, view: View = {}) => {
    const { sessionSize } = loadReviewSettings(s.repos);
    return loadFolderDetail(s.repos, s.folder.id, {
      ...view,
      now: NOW,
      sessionLimit: sessionSize === 'all' ? undefined : sessionSize,
    })!.reviewCount;
  };

  it.each([
    [3, 10, 3],
    [10, 10, 10],
    [11, 10, 10],
    [30, 10, 10],
    [30, 'all' as const, 30],
  ])('対象%i問 / sessionSize %s -> %i問 (button matches)', (total, size, expected) => {
    const s = seedMany(total, size);
    expect(started(s)).toBe(expected);
    expect(button(s)).toBe(expected);
  });

  it('applies to search and to each filter', () => {
    const s = seedMany(30, 10);
    const views: View[] = [
      { query: 'q' },
      { query: 'q1' },
      { filter: 'due' },
      { filter: 'all' },
      { filter: 'weak' },
    ];
    for (const view of views) expect(started(s, view)).toBe(button(s, view));
    expect(started(s, { query: 'q1' })).toBe(10);
    expect(started(s, { query: 'q29' })).toBe(1);
    expect(started(s, { filter: 'weak' })).toBe(0);
  });

  it('excludes deleted questions before capping', () => {
    const s = seedMany(11, 10);
    s.repos.questions.softDelete(s.repos.questions.listByFolder(s.folder.id)[0]!.id);
    expect(started(s)).toBe(10);
    s.repos.questions.softDelete(s.repos.questions.listByFolder(s.folder.id)[0]!.id);
    expect(started(s)).toBe(9);
    expect(button(s)).toBe(9);
  });
});

describe('rating a question that is not due', () => {
  it('records history but keeps the FSRS schedule', () => {
    const s = seed();
    const before = s.repos.review.getState(s.banana.id)!;
    const item = selectFolderViewItems(s.repos, s.folder.id, { filter: 'all' }, NOW).find(
      (i) => i.questionId === s.banana.id,
    );
    expect(item?.voluntary).toBe(true);
    const result = s.rate('b2', s.banana, 'again', item?.voluntary);
    expect(result).toMatchObject({ status: 'recorded', scheduleUpdated: false });
    expect(s.repos.review.getState(s.banana.id)).toEqual(before);
    expect(s.repos.review.listHistory(s.banana.id)).toHaveLength(2);
    expect(s.repos.review.answerStatsByFolder(s.folder.id)[s.banana.id]).toMatchObject({
      attempts: 2,
      incorrect: 1,
    });
  });

  it('still updates the schedule of a due question', () => {
    const s = seed();
    const item = selectFolderViewItems(s.repos, s.folder.id, { filter: 'all' }, NOW).find(
      (i) => i.questionId === s.apple.id,
    );
    expect(item?.voluntary).toBe(false);
    const result = s.rate('a1', s.apple, 'good', item?.voluntary);
    expect(result).toMatchObject({ status: 'recorded', scheduleUpdated: true });
    expect(s.repos.review.getState(s.apple.id)).toBeDefined();
  });
});
