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

  it('keeps decisions independent per account database', async () => {
    const guest = guestWithNote();
    const accountA = createTestDatabase();
    const accountB = createTestDatabase();
    declineGuestImport(accountA, GUEST, 1);
    expect(needsImportPrompt(guest, accountA, GUEST)).toBe(false);
    expect(needsImportPrompt(guest, accountB, GUEST)).toBe(true);

    const outcome = await runGuestImport({
      guest,
      account: accountB,
      guestDatabaseName: GUEST,
      copyImages: async () => 0,
      now: () => 5,
    });
    expect(outcome.ok).toBe(true);
    expect(readTransferDecision(accountB, GUEST)).toBe('imported');
    expect(readTransferDecision(accountA, GUEST)).toBe('declined');
  });

  it('imports once, then no longer asks', async () => {
    const guest = guestWithNote();
    const account = createTestDatabase();
    const outcome = await runGuestImport({
      guest,
      account,
      guestDatabaseName: GUEST,
      copyImages: async () => 0,
      now: () => 5,
    });
    expect(outcome.ok).toBe(true);
    expect(needsImportPrompt(guest, account, GUEST)).toBe(false);
  });

  it('a failed image copy marks nothing as imported and can be retried', async () => {
    const guest = guestWithNote();
    const account = createTestDatabase();
    const base = { guest, account, guestDatabaseName: GUEST, now: () => 5 };
    const rows = () => createRepositories({ ...createTestDeps(account).deps }).exporter.snapshot().notes;

    const failed = await runGuestImport({ ...base, copyImages: async () => 2 });
    expect(failed).toEqual({ ok: false, reason: 'images' });
    expect(readTransferDecision(account, GUEST)).toBeUndefined();
    expect(needsImportPrompt(guest, account, GUEST)).toBe(true);
    expect(rows()).toHaveLength(0);

    const rejected = await runGuestImport({
      ...base,
      copyImages: () => Promise.reject(new Error('disk full')),
    });
    expect(rejected.ok).toBe(false);
    expect(rows()).toHaveLength(0);

    expect((await runGuestImport({ ...base, copyImages: async () => 0 })).ok).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(readTransferDecision(account, GUEST)).toBe('imported');
  });

  it('does not touch the database until the image copy has settled', async () => {
    const guest = guestWithNote();
    const account = createTestDatabase();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pending = runGuestImport({
      guest,
      account,
      guestDatabaseName: GUEST,
      copyImages: async () => {
        await gate;
        return 0;
      },
      now: () => 5,
    });
    await Promise.resolve();
    expect(readTransferDecision(account, GUEST)).toBeUndefined();
    release();
    expect((await pending).ok).toBe(true);
    expect(readTransferDecision(account, GUEST)).toBe('imported');
  });
});
