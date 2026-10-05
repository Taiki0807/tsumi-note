import { eq } from 'drizzle-orm';

import { settings } from '../schema';
import type { RepositoryDeps } from '../types';

/** Key-value settings. Values are stored as strings; callers parse them. */
export function createSettingsRepository({ db, now }: RepositoryDeps) {
  return {
    get(key: string): string | undefined {
      return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
    },

    set(key: string, value: string): void {
      const updatedAt = now();
      db.insert(settings)
        .values({ key, value, updatedAt })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt, deletedAt: null } })
        .run();
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
