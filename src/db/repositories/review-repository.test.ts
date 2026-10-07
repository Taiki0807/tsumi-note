import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { State } from 'ts-fsrs';

import { newCardState, scheduleReview } from '../../domain/fsrs';
import { answerHistory, fsrsStates, reviewHistory } from '../schema';
import { createTestDatabase, createTestDeps } from '../test-utils';
import { createRepositories } from './index';

const DAY = 86_400_000;

function setup(file?: string) {
  const { deps, tick } = createTestDeps(createTestDatabase(file));
  const repos = createRepositories(deps);
  const folder = repos.folders.list()[0] ?? repos.folders.create({ name: '韓国語' });
  return { deps, repos, tick, folder };
}

const attempt = (id: string, questionId: string, rating: 'again' | 'hard' | 'good' | 'easy' = 'good') => ({
  attemptId: id,
  questionId,
  rating,
  timedOut: false,
  elapsedMs: 1_200,
});

describe('review repository: due selection', () => {
  it('treats a never-reviewed question as a new card that is due', () => {
    const { repos, folder } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    const due = repos.review.listDue();
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ isNew: true, folderName: '韓国語' });
    expect(due[0]!.question.id).toBe(q.id);
    expect(due[0]!.card.state).toBe(State.New);
  });

  it('orders by due time, nearest first', () => {
    const { repos, folder, tick } = setup();
    const a = repos.questions.create({ folderId: folder.id, prompt: 'a', answer: 'a' });
    tick();
    const b = repos.questions.create({ folderId: folder.id, prompt: 'b', answer: 'b' });
    tick();
    const c = repos.questions.create({ folderId: folder.id, prompt: 'c', answer: 'c' });
    tick(10 * DAY);
    // Reviewing `a` pushes it into the future; b (older) comes before c.
    repos.review.applyRating(attempt('r1', a.id, 'easy'));
    expect(repos.review.listDue().map((d) => d.question.id)).toEqual([b.id, c.id]);
    expect(repos.review.listDue({ at: 10_000 * DAY }).map((d) => d.question.id)).toEqual([b.id, c.id, a.id]);
  });

  it('applies the limit without padding when fewer are due', () => {
    const { repos, folder } = setup();
    for (let i = 0; i < 3; i++) repos.questions.create({ folderId: folder.id, prompt: `q${i}`, answer: 'a' });
    expect(repos.review.listDue({ limit: 2 })).toHaveLength(2);
    expect(repos.review.listDue({ limit: 10 })).toHaveLength(3);
    expect(repos.review.listDue()).toHaveLength(3);
  });

  it('includes a question exactly at its due time and excludes it one ms earlier', () => {
    const { repos, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating(attempt('r1', q.id, 'easy'));
    const dueAt = repos.review.getState(q.id)!.dueAt;
    expect(repos.review.listDue({ at: dueAt - 1 })).toEqual([]);
    expect(repos.review.listDue({ at: dueAt }).map((d) => d.question.id)).toEqual([q.id]);
    expect(repos.review.countDue(dueAt - 1)).toBe(0);
    expect(repos.review.countDue(dueAt)).toBe(1);
  });

  it('skips deleted questions and questions in deleted folders', () => {
    const { repos, folder } = setup();
    const other = repos.folders.create({ name: 'other' });
    const gone = repos.questions.create({ folderId: folder.id, prompt: 'x', answer: 'x' });
    repos.questions.create({ folderId: other.id, prompt: 'y', answer: 'y' });
    repos.questions.softDelete(gone.id);
    repos.folders.softDelete(other.id);
    expect(repos.review.listDue()).toEqual([]);
    expect(repos.review.countReviewable()).toBe(0);
  });

  it('tells "no questions" apart from "nothing due"', () => {
    const { repos, folder, tick } = setup();
    expect(repos.review.countReviewable()).toBe(0);
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating(attempt('r1', q.id, 'easy'));
    expect(repos.review.countDue()).toBe(0);
    expect(repos.review.countReviewable()).toBe(1);
    expect(repos.review.nextDueAfter()).toBe(repos.review.getState(q.id)!.dueAt);
  });
});

describe('review repository: rating', () => {
  it('stores the ts-fsrs result as the current FSRS state', () => {
    const { repos, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    const reviewedAt = 2_000;
    const result = repos.review.applyRating(attempt('r1', q.id, 'good'));
    const expected = scheduleReview(newCardState(q.createdAt), 'good', reviewedAt).next;
    expect(result).toEqual({ status: 'recorded', card: expected, reviewedAt, scheduleUpdated: true });
    expect(repos.review.getState(q.id)).toEqual(expected);
  });

  it.each(['again', 'hard', 'good', 'easy'] as const)('persists the %s schedule and due', (rating) => {
    const { repos, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating(attempt('r1', q.id, rating));
    const expected = scheduleReview(newCardState(q.createdAt), rating, 2_000).next;
    expect(repos.review.getState(q.id)).toEqual(expected);
    // due moved forward, so the question left the due list (except for sub-second steps)
    expect(expected.dueAt).toBeGreaterThan(2_000);
  });

  it('removes a rated question from the due list until it is due again', () => {
    const { repos, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating(attempt('r1', q.id, 'good'));
    expect(repos.review.listDue()).toEqual([]);
    const { dueAt } = repos.review.getState(q.id)!;
    expect(repos.review.listDue({ at: dueAt }).map((d) => d.isNew)).toEqual([false]);
  });

  it('continues from the stored state on the next review', () => {
    const { repos, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating(attempt('r1', q.id, 'good'));
    const first = repos.review.getState(q.id)!;
    tick(60_000);
    repos.review.applyRating(attempt('r2', q.id, 'good'));
    expect(repos.review.getState(q.id)).toEqual(scheduleReview(first, 'good', 62_000).next);
    expect(repos.review.getState(q.id)!.reps).toBe(2);
  });

  it('appends Review History and Answer History with the pre-review snapshot', () => {
    const { repos, deps, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating({ ...attempt('r1', q.id, 'again'), elapsedMs: 4_321 });
    tick();
    repos.review.applyRating(attempt('r2', q.id, 'easy'));

    const history = repos.review.listHistory(q.id);
    expect(history.map((h) => [h.id, h.rating, h.reviewedAt])).toEqual([
      ['r1', 'again', 2_000],
      ['r2', 'easy', 3_000],
    ]);
    expect(history[0]).toMatchObject({
      questionId: q.id,
      timedOut: false,
      elapsedMs: 4_321,
      state: State.New,
      stability: 0,
      difficulty: 0,
    });
    expect(history[1]!.state).toBe(State.Learning);
    expect(
      deps.db
        .select()
        .from(answerHistory)
        .all()
        .map((a) => a.result),
    ).toEqual(['incorrect', 'correct']);
  });

  it('records a timeout in both histories without treating it as Again', () => {
    const { repos, deps, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating({ ...attempt('r1', q.id, 'good'), timedOut: true, elapsedMs: 45_000 });
    const [row] = repos.review.listHistory(q.id);
    expect(row).toMatchObject({ rating: 'good', timedOut: true, elapsedMs: 45_000 });
    expect(deps.db.select().from(answerHistory).all()[0]!.result).toBe('timeout');
    // FSRS used the chosen rating.
    expect(repos.review.getState(q.id)).toEqual(
      scheduleReview(newCardState(q.createdAt), 'good', 2_000).next,
    );
  });

  it('reports a deleted question without writing anything', () => {
    const { repos, deps, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    repos.questions.softDelete(q.id);
    tick();
    expect(repos.review.applyRating(attempt('r1', q.id))).toEqual({ status: 'question-missing' });
    expect(deps.db.select().from(reviewHistory).all()).toEqual([]);
    expect(deps.db.select().from(fsrsStates).all()).toEqual([]);
  });
});

describe('review repository: safety', () => {
  it('ignores a repeated attempt: one history row, state updated once', () => {
    const { repos, deps, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    const first = repos.review.applyRating(attempt('r1', q.id, 'good'));
    const stateAfterFirst = repos.review.getState(q.id);
    tick();
    const second = repos.review.applyRating(attempt('r1', q.id, 'good'));
    const third = repos.review.applyRating(attempt('r1', q.id, 'easy'));

    expect(first.status).toBe('recorded');
    expect(second).toEqual({ status: 'duplicate', card: stateAfterFirst });
    expect(third.status).toBe('duplicate');
    expect(repos.review.getState(q.id)).toEqual(stateAfterFirst);
    expect(repos.review.getState(q.id)!.reps).toBe(1);
    expect(deps.db.select().from(reviewHistory).all()).toHaveLength(1);
    expect(deps.db.select().from(answerHistory).all()).toHaveLength(1);
  });

  it('rolls everything back when a write fails midway (no half-applied rating)', () => {
    const { repos, deps, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    // Make the second insert (answer_history) collide so the transaction fails after review_history.
    deps.db
      .insert(answerHistory)
      .values({ id: 'r1', createdAt: 1, questionId: q.id, result: 'correct', answeredAt: 1 })
      .run();
    expect(() => repos.review.applyRating(attempt('r1', q.id))).toThrow();
    expect(deps.db.select().from(reviewHistory).all()).toEqual([]);
    expect(repos.review.getState(q.id)).toBeUndefined();
    expect(repos.review.listDue()).toHaveLength(1);
  });

  it('never rewrites earlier history when later reviews are added', () => {
    const { repos, folder, tick } = setup();
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.review.applyRating(attempt('r1', q.id, 'hard'));
    const before = repos.review.listHistory(q.id)[0];
    tick();
    repos.review.applyRating(attempt('r2', q.id, 'good'));
    expect(repos.review.listHistory(q.id)[0]).toEqual(before);
    expect(repos.review.listHistory(q.id)).toHaveLength(2);
  });
});

describe('review repository: persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'tsumi-note-review-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps FSRS state, due and history after the database is reopened (app restart)', () => {
    const file = path.join(dir, 'app.db');
    const first = setup(file);
    const q = first.repos.questions.create({ folderId: first.folder.id, prompt: 'Q', answer: 'A' });
    first.tick();
    first.repos.review.applyRating(attempt('r1', q.id, 'good'));
    const state = first.repos.review.getState(q.id)!;
    const history = first.repos.review.listHistory(q.id);

    const second = setup(file);
    expect(second.repos.review.getState(q.id)).toEqual(state);
    expect(second.repos.review.listHistory(q.id)).toEqual(history);
    expect(second.repos.review.listDue({ at: state.dueAt - 1 })).toEqual([]);
    expect(second.repos.review.listDue({ at: state.dueAt })).toHaveLength(1);
  });

  it('keeps Phase 1-4 data when the Phase 5 migrations are applied to an older database', () => {
    const migrationsDir = path.join(__dirname, '../../../drizzle');
    // A database as shipped before Phase 5: only the initial migration applied.
    const old = path.join(dir, 'old-migrations');
    mkdirSync(path.join(old, 'meta'), { recursive: true });
    cpSync(path.join(migrationsDir, '0000_init.sql'), path.join(old, '0000_init.sql'));
    const journal = JSON.parse(readFileSync(path.join(migrationsDir, 'meta/_journal.json'), 'utf8'));
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(path.join(old, 'meta/_journal.json'), JSON.stringify(journal));

    const file = path.join(dir, 'phase4.db');
    const sqlite = new Database(file);
    migrate(drizzle(sqlite), { migrationsFolder: old });
    sqlite.exec(`
      INSERT INTO folders (id, created_at, updated_at, name) VALUES ('f1', 1, 1, '韓国語');
      INSERT INTO questions (id, created_at, updated_at, folder_id, prompt, answer) VALUES ('q1', 2, 2, 'f1', 'Q', 'A');
      INSERT INTO study_sessions (id, created_at, started_at, ended_at, duration_seconds) VALUES ('s1', 3, 1, 61, 60);
      INSERT INTO answer_history (id, created_at, question_id, result, answered_at) VALUES ('a1', 4, 'q1', 'correct', 4);
    `);
    sqlite.close();

    const upgraded = setup(file);
    expect(upgraded.repos.folders.list().map((f) => f.name)).toEqual(['韓国語']);
    expect(upgraded.repos.questions.getById('q1')).toMatchObject({ prompt: 'Q', answer: 'A' });
    expect(upgraded.repos.studySessions.listBetween(0, 100)).toHaveLength(1);
    expect(upgraded.deps.db.select().from(answerHistory).all()).toHaveLength(1);
    // The existing question becomes reviewable as a new card.
    expect(upgraded.repos.review.listDue({ at: 10 }).map((d) => d.question.id)).toEqual(['q1']);
  });
});
