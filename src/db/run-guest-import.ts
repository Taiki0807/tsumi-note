import {
  copyGuestDataToAccount,
  hasLocalData,
  readTransferDecision,
  recordTransferDecision,
  type TransferResult,
} from './guest-transfer';
import type { AppDatabase } from './types';

export type ImportDeps = {
  guest: AppDatabase;
  account: AppDatabase;
  guestDatabaseName: string;
  /** Copies guest note images into the account directory; returns how many files failed. Never deletes. */
  copyImages: () => Promise<number>;
  now: () => number;
};

/** Whether to ask the user. Only when the guest has data and the user has not decided yet. */
export function needsImportPrompt(
  guest: AppDatabase,
  account: AppDatabase,
  guestDatabaseName: string,
): boolean {
  return readTransferDecision(account, guestDatabaseName) === undefined && hasLocalData(guest);
}

export type ImportOutcome =
  { ok: true; result: TransferResult } | { ok: false; reason: 'images' | 'database'; error?: unknown };

/**
 * Explicit, user-confirmed import. Files and rows cannot be committed atomically together, so the order
 * is: (1) await every image copy (size-verified, idempotent); (2) only if all succeeded, copy rows and
 * record the `imported` marker in one transaction. A failed image therefore never leaves rows that
 * reference a missing file or an `imported` marker; a retry reuses the finished files.
 * Neither the guest database nor the guest images are changed.
 */
export async function runGuestImport(deps: ImportDeps): Promise<ImportOutcome> {
  let failedImages: number;
  try {
    failedImages = await deps.copyImages();
  } catch (error) {
    return { ok: false, reason: 'images', error };
  }
  if (failedImages > 0) return { ok: false, reason: 'images' };
  try {
    return {
      ok: true,
      result: copyGuestDataToAccount(deps.guest, deps.account, deps.guestDatabaseName, deps.now()),
    };
  } catch (error) {
    return { ok: false, reason: 'database', error };
  }
}

/** "Don't import": remembered so the prompt is not repeated. The guest data stays on the device. */
export function declineGuestImport(account: AppDatabase, guestDatabaseName: string, now: number): void {
  recordTransferDecision(account, guestDatabaseName, 'declined', now);
}
