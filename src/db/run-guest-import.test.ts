import { createRepositories } from './repositories';
import { readTransferDecision } from './guest-transfer';
import { declineGuestImport, needsImportPrompt, runGuestImport } from './run-guest-import';
import { createTestDatabase, createTestDeps } from './test-utils';

const GUEST = 'tsumi-note.db';

function guestWithNote() {
  const { deps } = createTestDeps();
  createRepositories(deps).notes.create({ title: 'ゲストのメモ', body: '' });
  return deps.db;
}

describe('guest import prompt and execution', () => {
  it('asks only when the guest has data and nothing was decided', () => {
    const account = createTestDatabase();
    expect(needsImportPrompt(createTestDatabase(), account, GUEST)).toBe(false);
    const guest = guestWithNote();
    expect(needsImportPrompt(guest, account, GUEST)).toBe(true);
    declineGuestImport(account, GUEST, 1);
    expect(needsImportPrompt(guest, account, GUEST)).toBe(false);
    expect(readTransferDecision(account, GUEST)).toBe('declined');
  });

  it('declining keeps the guest data and writes nothing into the account', () => {
    const guest = guestWithNote();
    const account = createTestDatabase();
    declineGuestImport(account, GUEST, 1);
    const snap = (db: typeof guest) => createRepositories({ ...createTestDeps(db).deps }).exporter.snapshot();
    expect(snap(guest).notes).toHaveLength(1);
    expect(snap(account).notes).toHaveLength(0);
  });

  it('imports once, then no longer asks', () => {
    const guest = guestWithNote();
    const account = createTestDatabase();
    const outcome = runGuestImport({
      guest,
      account,
      guestDatabaseName: GUEST,
      copyImages: () => 0,
      now: () => 5,
    });
    expect(outcome.ok).toBe(true);
    expect(needsImportPrompt(guest, account, GUEST)).toBe(false);
  });

  it('a failed image copy marks nothing as imported and can be retried', () => {
    const guest = guestWithNote();
    const account = createTestDatabase();
    const base = { guest, account, guestDatabaseName: GUEST, now: () => 5 };

    const failed = runGuestImport({ ...base, copyImages: () => 2 });
    expect(failed).toEqual({ ok: false, reason: 'images' });
    expect(readTransferDecision(account, GUEST)).toBeUndefined();
    expect(needsImportPrompt(guest, account, GUEST)).toBe(true);

    const thrown = runGuestImport({
      ...base,
      copyImages: () => {
        throw new Error('disk full');
      },
    });
    expect(thrown.ok).toBe(false);

    expect(runGuestImport({ ...base, copyImages: () => 0 }).ok).toBe(true);
  });
});
