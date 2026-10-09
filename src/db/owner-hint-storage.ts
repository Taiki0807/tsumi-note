import * as SecureStore from 'expo-secure-store';

import type { OwnerHintStorage } from './resolve-owner';

const KEY = 'tsumi-note.last-owner';

/**
 * The account whose database was open at the last launch. Only an opaque account id (no email or token),
 * kept in the Keychain next to the session so it is cleared and restored together with it.
 */
export const ownerHintStorage: OwnerHintStorage = {
  get: () => {
    try {
      return SecureStore.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (id) => {
    try {
      SecureStore.setItem(KEY, id);
    } catch {
      // The hint only speeds up a restart; the session decides the owner once it is restored.
    }
  },
  clear: () => {
    void SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  },
};
