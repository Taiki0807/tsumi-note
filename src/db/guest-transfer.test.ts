import { sql } from 'drizzle-orm';

import { createRepositories } from './repositories';
import {
  copyGuestDataToAccount,
  hasLocalData,
  readTransferDecision,
  recordTransferDecision,
} from './guest-transfer';
import { databaseNameForOwner, imageDirectoryForOwner, isValidAccountId } from './ownership';
import { createTestDatabase, createTestDeps } from './test-utils';
import { folders, notes, reviewHistory } from './schema';

const GUEST = 'tsumi-note.db';

function seedGuest() {
  const { deps } = createTestDeps();
  const repos = createRepositories(deps);
  const folder = repos.folders.create({ name: '英語' });
  const note = repos.notes.create({ folderId: folder.id, title: 'メモ', body: 'note-image://a.jpg' });
  const question = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
  repos.studySessions.record({ folderId: folder.id, startedAt: 0, endedAt: 60_000, durationSeconds: 60 });
  repos.review.applyRating({
    attemptId: 'attempt-1',
    questionId: question.id,
    rating: 'good',
    timedOut: false,
    elapsedMs: null,
  });
  repos.settings.set('darkMode', 'dark');
  repos.goals.save({ title: '合格', examDay: '2027-01-01', objective: '', purpose: '', actionPlan: '' });
  return { deps, repos, folder, note, question };
}

describe('ownership', () => {
  it('uses the existing file for the guest', () => {
    expect(databaseNameForOwner(null)).toBe('tsumi-note.db');
    expect(imageDirectoryForOwner(null)).toBe('note-images');
  });

  it('derives a safe, case-insensitive-unique file name from the account id only', () => {
    const a = databaseNameForOwner('AbC');
    const b = databaseNameForOwner('abc');
    expect(a).toMatch(/^tsumi-note-acct-[0-9a-f]+\.db$/);
    expect(a.toLowerCase()).not.toBe(b.toLowerCase());
    expect(imageDirectoryForOwner('AbC')).toMatch(/^note-images-acct-[0-9a-f]+$/);
    expect(databaseNameForOwner('u1')).not.toBe(databaseNameForOwner('u2'));
  });

  it('rejects ids that could escape the directory or look like emails', () => {
    for (const id of ['../x', 'a/b', 'a@b.com', '', 'a b', 'x'.repeat(129)]) {
      expect(isValidAccountId(id)).toBe(false);
      expect(() => databaseNameForOwner(id)).toThrow();
    }
  });
});

describe('copyGuestDataToAccount', () => {
  it('copies all guest data keeping ids, and leaves the guest database untouched', () => {
    const { deps, folder, note, question } = seedGuest();
    const guestBefore = createRepositories(deps).exporter.snapshot();
    const account = createTestDatabase();

    const result = copyGuestDataToAccount(deps.db, account, GUEST, 10);

    const copied = createRepositories({ ...deps, db: account }).exporter.snapshot();
    expect(copied.folders.map((f) => f.id)).toEqual([folder.id]);
    expect(copied.notes.map((n) => n.id)).toEqual([note.id]);
    expect(copied.questions.map((q) => q.id)).toEqual([question.id]);
    expect(copied.fsrsStates).toHaveLength(1);
    expect(copied.reviewHistory).toHaveLength(1);
    expect(copied.answerHistory).toEqual(guestBefore.answerHistory);
    expect(copied.studySessions).toHaveLength(1);
    expect(copied.goals).toHaveLength(1);
    expect(copied.settings.find((s) => s.key === 'darkMode')?.value).toBe('dark');
    expect(copied.notes[0]?.body).toBe('note-image://a.jpg');
    expect(result.inserted.notes).toBe(1);
    expect(readTransferDecision(account, GUEST)).toBe('imported');
    // guest untouched
    expect(createRepositories(deps).exporter.snapshot()).toEqual(guestBefore);
  });

  it('is idempotent: running it again creates no duplicates', () => {
    const { deps } = seedGuest();
    const account = createTestDatabase();
    copyGuestDataToAccount(deps.db, account, GUEST, 10);
    const first = createRepositories({ ...deps, db: account }).exporter.snapshot();

    const second = copyGuestDataToAccount(deps.db, account, GUEST, 20);

    expect(createRepositories({ ...deps, db: account }).exporter.snapshot().notes).toEqual(first.notes);
    expect(Object.values(second.inserted).every((n) => n === 0)).toBe(true);
  });

  it('never overwrites existing account data and keeps a single active goal', () => {
    const { deps, note } = seedGuest();
    const account = createTestDatabase();
    const accountDeps = { ...createTestDeps(account).deps, newId: () => 'acct-1' };
    const accountRepos = createRepositories(accountDeps);
    accountRepos.settings.set('darkMode', 'light');
    accountRepos.goals.save({ title: '既存', examDay: null, objective: '', purpose: '', actionPlan: '' });
    account.insert(folders).values({ id: 'f-x', name: 'A', createdAt: 1, updatedAt: 1 }).run();
    account
      .insert(notes)
      .values({ id: note.id, title: 'アカウント側', body: '', createdAt: 1, updatedAt: 1 })
      .run();

    const result = copyGuestDataToAccount(deps.db, account, GUEST, 10);

    const snap = accountRepos.exporter.snapshot();
    expect(snap.settings.find((s) => s.key === 'darkMode')?.value).toBe('light');
    expect(snap.notes.find((n) => n.id === note.id)?.title).toBe('アカウント側');
    expect(snap.goals.filter((g) => g.deletedAt === null)).toHaveLength(1);
    expect(result.skippedGoals).toBe(1);
  });

  it('rolls back completely when a write fails', () => {
    const { deps } = seedGuest();
    const account = createTestDatabase();
    // A review_history row pointing at a question that cannot be inserted triggers an FK failure at the end.
    deps.db.run(sql`PRAGMA foreign_keys = OFF`);
    deps.db
      .insert(reviewHistory)
      .values({ id: 'orphan', createdAt: 1, questionId: 'missing', rating: 'good', reviewedAt: 1 })
      .run();

    expect(() => copyGuestDataToAccount(deps.db, account, GUEST, 10)).toThrow();

    expect(hasLocalData(account)).toBe(false);
    expect(readTransferDecision(account, GUEST)).toBeUndefined();
  });

  it('separates two accounts', () => {
    const { deps } = seedGuest();
    const a = createTestDatabase();
    const b = createTestDatabase();
    copyGuestDataToAccount(deps.db, a, GUEST, 10);

    expect(hasLocalData(a)).toBe(true);
    expect(hasLocalData(b)).toBe(false);
  });
});

describe('transfer decision', () => {
  it('persists across reopening the account database', () => {
    const account = createTestDatabase();
    expect(readTransferDecision(account, GUEST)).toBeUndefined();
    recordTransferDecision(account, GUEST, 'declined', 1);
    expect(readTransferDecision(account, GUEST)).toBe('declined');
  });
});

describe('hasLocalData', () => {
  it('is false for a fresh database', () => {
    expect(hasLocalData(createTestDatabase())).toBe(false);
  });
});
