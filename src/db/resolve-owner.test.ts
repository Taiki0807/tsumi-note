import { resolveOwner, syncOwnerHint, type OwnerHintStorage } from './resolve-owner';

function memoryStorage(initial: string | null = null): OwnerHintStorage & { value: string | null } {
  const storage = {
    value: initial,
    get: () => storage.value,
    set: (id: string) => {
      storage.value = id;
    },
    clear: () => {
      storage.value = null;
    },
  };
  return storage;
}

describe('resolveOwner', () => {
  it('opens the account database when signed in', () => {
    expect(resolveOwner({ status: 'signedIn', userId: 'u1' }, null)).toBe('u1');
  });

  it('opens the guest database when signed out, even if a hint remains', () => {
    expect(resolveOwner({ status: 'signedOut' }, 'u1')).toBeNull();
  });

  it('restores the last owner while the session is loading, guest when there is none', () => {
    expect(resolveOwner({ status: 'loading' }, 'u1')).toBe('u1');
    expect(resolveOwner({ status: 'loading' }, null)).toBeNull();
  });

  it('falls back to guest for ids that cannot be a safe file name', () => {
    expect(resolveOwner({ status: 'signedIn', userId: '../evil' }, null)).toBeNull();
    expect(resolveOwner({ status: 'loading' }, 'a@b.com')).toBeNull();
  });
});

describe('syncOwnerHint (app restart / logout)', () => {
  it('survives a restart: the hint written at sign-in selects the account while loading', () => {
    const storage = memoryStorage();
    syncOwnerHint({ status: 'signedIn', userId: 'u1' }, storage);
    const hint = syncOwnerHint({ status: 'loading' }, storage);
    expect(resolveOwner({ status: 'loading' }, hint)).toBe('u1');
  });

  it('is cleared on logout so the next launch opens the guest database', () => {
    const storage = memoryStorage('u1');
    syncOwnerHint({ status: 'signedOut' }, storage);
    expect(storage.value).toBeNull();
    expect(resolveOwner({ status: 'loading' }, syncOwnerHint({ status: 'loading' }, storage))).toBeNull();
  });

  it('switches directly from account A to account B', () => {
    const storage = memoryStorage('a');
    syncOwnerHint({ status: 'signedIn', userId: 'b' }, storage);
    expect(storage.value).toBe('b');
  });

  it('does not touch the hint while loading', () => {
    const storage = memoryStorage('u1');
    syncOwnerHint({ status: 'loading' }, storage);
    expect(storage.value).toBe('u1');
  });
});
