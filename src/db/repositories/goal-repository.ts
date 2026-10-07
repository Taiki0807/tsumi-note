import { eq, isNull } from 'drizzle-orm';

import type { GoalInput } from '../../domain/goal';
import { goals } from '../schema';
import type { RepositoryDeps } from '../types';

export type Goal = typeof goals.$inferSelect;

/**
 * v1 holds exactly one active (non-deleted) goal. The invariant is enforced here, not in the
 * schema: `save` updates the live row if there is one, otherwise it creates it.
 */
export function createGoalRepository({ db, now, newId }: RepositoryDeps) {
  const live = () =>
    db.select().from(goals).where(isNull(goals.deletedAt)).orderBy(goals.createdAt).limit(1).get();

  return {
    /** The active goal, or undefined when none is set. */
    getActive(): Goal | undefined {
      return live();
    },

    /** Creates the active goal or edits the existing one; never leaves two live goals. */
    save(input: GoalInput): Goal {
      const at = now();
      const existing = live();
      if (existing) {
        db.update(goals)
          .set({ ...input, updatedAt: at })
          .where(eq(goals.id, existing.id))
          .run();
        return { ...existing, ...input, updatedAt: at };
      }
      const created: Goal = { id: newId(), createdAt: at, updatedAt: at, deletedAt: null, ...input };
      db.insert(goals).values(created).run();
      return created;
    },

    /** Tombstone delete (sync-safe). */
    removeActive(): void {
      const at = now();
      db.update(goals).set({ deletedAt: at, updatedAt: at }).where(isNull(goals.deletedAt)).run();
    },
  };
}

export type GoalRepository = ReturnType<typeof createGoalRepository>;
