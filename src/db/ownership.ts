/**
 * Local data ownership (docs/PHASE8_DESIGN.md §2).
 * Guest data lives in the existing `tsumi-note.db`; every account gets its own SQLite file and image directory.
 * File names are derived only from the account id (never the email or display name).
 */
export const GUEST_DATABASE_NAME = 'tsumi-note.db';
export const GUEST_IMAGE_DIRECTORY = 'note-images';

/** Owner of the local data: `null` is the guest. */
export type OwnerId = string | null;

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidAccountId(id: string): boolean {
  return ACCOUNT_ID_PATTERN.test(id);
}

/**
 * Lower-case hex of the id's characters. iOS file systems are case-insensitive by default, so hex avoids
 * two ids that differ only in case sharing a file.
 */
function accountKey(id: string): string {
  if (!isValidAccountId(id)) throw new Error('Invalid account id');
  let hex = '';
  for (let i = 0; i < id.length; i += 1) hex += id.charCodeAt(i).toString(16).padStart(2, '0');
  return hex;
}

export function databaseNameForOwner(owner: OwnerId): string {
  return owner === null ? GUEST_DATABASE_NAME : `tsumi-note-acct-${accountKey(owner)}.db`;
}

/** Image directory name, relative to the document directory. */
export function imageDirectoryForOwner(owner: OwnerId): string {
  return owner === null ? GUEST_IMAGE_DIRECTORY : `note-images-acct-${accountKey(owner)}`;
}
