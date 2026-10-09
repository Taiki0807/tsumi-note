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
  copyImages: () => number;
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
 * Explicit, user-confirmed import. Images are copied first (idempotent, files only) so a failure leaves
 * nothing marked as imported and the whole thing can be retried; then rows are copied atomically.
 * Neither the guest database nor the guest images are changed.
 */
export function runGuestImport(deps: ImportDeps): ImportOutcome {
  let failedImages: number;
  try {
    failedImages = deps.copyImages();
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
