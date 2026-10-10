import { isValidAccountId, type OwnerId } from './ownership';

export type OwnerAuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; userId: string };

/**
 * Which local database to open.
 *
 * - signedIn  -> that account's database (an id that cannot form a safe file name falls back to guest)
 * - signedOut -> guest. An account's data is never shown without a session.
 * - loading   -> the owner confirmed at the last launch, so a restart opens the right database without
 *                waiting for (or needing) the network; guest when there is none.
 */
export function resolveOwner(auth: OwnerAuthState, lastOwner: string | null): OwnerId {
  const valid = (id: string | null): OwnerId => (id !== null && isValidAccountId(id) ? id : null);
  switch (auth.status) {
    case 'signedIn':
      return valid(auth.userId);
    case 'signedOut':
      return null;
    case 'loading':
      return valid(lastOwner);
  }
}

export type OwnerHintStorage = {
  get(): string | null;
  set(id: string): void;
  clear(): void;
};

/** Keeps the hint equal to the last confirmed owner. Returns the value to use for `resolveOwner`. */
export function syncOwnerHint(auth: OwnerAuthState, storage: OwnerHintStorage): string | null {
  if (auth.status === 'loading') return storage.get();
  if (auth.status === 'signedIn' && isValidAccountId(auth.userId)) {
    if (storage.get() !== auth.userId) storage.set(auth.userId);
    return auth.userId;
  }
  if (storage.get() !== null) storage.clear();
  return null;
}
