import { createRepositories } from '@/db/repositories';
import { createTestDeps } from '@/db/test-utils';

import { loadFolderDetail, loadFolderList } from './library-use-cases';

function setup() {
  return createRepositories(createTestDeps().deps);
}

type Repos = ReturnType<typeof setup>;

const rate = (repos: Repos, attemptId: string, questionId: string, rating: 'again' | 'good') =>
  repos.review.applyRating({ attemptId, questionId, rating, timedOut: false, elapsedMs: 1 });

describe('folder search', () => {
  it('matches folder names by substring, and treats LIKE wildcards literally', () => {
    const repos = setup();
    repos.folders.create({ name: '韓国語' });
    repos.folders.create({ name: '簿記2級' });
    repos.folders.create({ name: '100%達成' });
    const names = (query?: string) => loadFolderList(repos, { query }).folders.map((f) => f.name);

    expect(names('')).toHaveLength(3);
    expect(names('   ')).toHaveLength(3);
    expect(names('簿記')).toEqual(['簿記2級']);
    expect(names(' 韓国 ')).toEqual(['韓国語']);
    expect(names('%')).toEqual(['100%達成']);
    expect(names('_')).toEqual([]);
    expect(names('存在しない')).toEqual([]);
  });

  it('does not return deleted folders and totals only the matches', () => {
    const repos = setup();
    const a = repos.folders.create({ name: '英語A' });
    const b = repos.folders.create({ name: '英語B' });
    repos.questions.create({ folderId: a.id, prompt: 'q', answer: 'a' });
    repos.questions.create({ folderId: b.id, prompt: 'q', answer: 'a' });
    repos.folders.softDelete(b.id);
    const list = loadFolderList(repos, { query: '英語' });
    expect(list.folders.map((f) => f.name)).toEqual(['英語A']);
    expect(list.totalQuestions).toBe(1);
  });

  it('shows each folder due count', () => {
    const repos = setup();
    const a = repos.folders.create({ name: 'a' });
    const b = repos.folders.create({ name: 'b' });
    repos.questions.create({ folderId: a.id, prompt: '1', answer: '1' });
    repos.questions.create({ folderId: a.id, prompt: '2', answer: '2' });
    repos.questions.create({ folderId: b.id, prompt: '3', answer: '3' });
    expect(loadFolderList(repos).folders.map((f) => f.dueCount)).toEqual([2, 1]);
  });
});

describe('question management', () => {
  function seed() {
    const repos = setup();
    const folder = repos.folders.create({ name: '韓国語' });
    const other = repos.folders.create({ name: '他' });
    const make = (prompt: string, answer: string, folderId = folder.id) =>
      repos.questions.create({ folderId, prompt, answer });
    return { repos, folder, other, make };
  }

  it('searches prompt and answer, combined with the filter tabs', () => {
    const { repos, folder, make } = seed();
    const q1 = make('「꾸준히」の意味は？', 'こつこつと');
    const q2 = make('「오히려」の意味は？', 'かえって');
    make('りんご', 'apple');
    // q1: 3 attempts, 2 incorrect -> 苦手. q2: 1 attempt, 0 incorrect.
    rate(repos, 'a1', q1.id, 'again');
    rate(repos, 'a2', q1.id, 'again');
    rate(repos, 'a3', q1.id, 'good');
    rate(repos, 'a4', q2.id, 'good');

    const ids = (options: Parameters<typeof loadFolderDetail>[2]) =>
      loadFolderDetail(repos, folder.id, options)!.rows.map((r) => r.question.id);

    expect(ids({ query: '意味' })).toEqual([q1.id, q2.id]);
    expect(ids({ query: 'かえって' })).toEqual([q2.id]);
    expect(ids({ query: 'APPLE' })).toHaveLength(1);
    expect(ids({ query: 'zzz' })).toEqual([]);
    expect(ids({ query: '意味', filter: 'weak' })).toEqual([q1.id]);
    expect(ids({ query: 'かえって', filter: 'weak' })).toEqual([]);
    expect(loadFolderDetail(repos, folder.id, { query: '意味' })!.counts).toEqual({
      all: 2,
      due: 0,
      weak: 1,
    });
  });

  it('computes incorrect counts from Answer History; timeouts are not incorrect', () => {
    const { repos, folder, make } = seed();
    const q = make('Q', 'A');
    rate(repos, 'a1', q.id, 'again');
    rate(repos, 'a2', q.id, 'again');
    rate(repos, 'a3', q.id, 'good');
    repos.review.applyRating({
      attemptId: 'a4',
      questionId: q.id,
      rating: 'good',
      timedOut: true,
      elapsedMs: 9,
    });

    const [row] = loadFolderDetail(repos, folder.id)!.rows;
    expect(row).toMatchObject({ attempts: 4, incorrect: 2, incorrectRate: 0.5 });
    expect(repos.review.answerStatsByFolder(folder.id)[q.id]).toEqual({
      attempts: 4,
      incorrect: 2,
      timeouts: 1,
    });
  });

  it('leaves a never-answered question without a rate and out of 苦手', () => {
    const { repos, folder, make } = seed();
    make('Q', 'A');
    const detail = loadFolderDetail(repos, folder.id)!;
    expect(detail.rows[0]).toMatchObject({ attempts: 0, incorrect: 0, incorrectRate: null });
    expect(detail.counts.weak).toBe(0);
  });

  it('does not treat a single wrong answer as 苦手', () => {
    const { repos, folder, make } = seed();
    const q = make('Q', 'A');
    rate(repos, 'a1', q.id, 'again');
    expect(loadFolderDetail(repos, folder.id)!.counts.weak).toBe(0);
  });

  it('sorts by incorrect rate (highest first), unanswered last', () => {
    const { repos, folder, make } = seed();
    const none = make('none', 'a');
    const low = make('low', 'a');
    const high = make('high', 'a');
    rate(repos, 'l1', low.id, 'good');
    rate(repos, 'l2', low.id, 'again');
    rate(repos, 'l3', low.id, 'good');
    rate(repos, 'h1', high.id, 'again');
    rate(repos, 'h2', high.id, 'again');
    rate(repos, 'h3', high.id, 'good');
    expect(loadFolderDetail(repos, folder.id)!.rows.map((r) => r.question.id)).toEqual([
      high.id,
      low.id,
      none.id,
    ]);
  });

  it('counts due questions and filters the 復習待ち tab', () => {
    const { repos, folder, other, make } = seed();
    const a = make('a', 'a');
    make('b', 'b');
    make('x', 'x', other.id);
    rate(repos, 'r', a.id, 'good');
    // Rated "good" now: a is scheduled into the future (new card, minutes later) - use a far "now".
    const detail = loadFolderDetail(repos, folder.id, { filter: 'due', now: 1_000 })!;
    expect(detail.dueCount).toBe(1);
    expect(detail.rows.map((r) => r.question.prompt)).toEqual(['b']);
    expect(detail.counts).toMatchObject({ all: 2, due: 1 });
  });

  it('restricts a review session to one folder', () => {
    const { repos, folder, other, make } = seed();
    const mine = make('a', 'a');
    make('x', 'x', other.id);
    expect(repos.review.listDue({ folderId: folder.id }).map((d) => d.question.id)).toEqual([mine.id]);
    expect(repos.review.countDue(undefined, folder.id)).toBe(1);
    expect(repos.review.countDue()).toBe(2);
  });
});
