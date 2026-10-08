import { eq, isNull } from 'drizzle-orm';

import { legacyEpochToExamDay, type GoalInput } from '../../domain/goal';
import { goals } from '../schema';
import type { RepositoryDeps } from '../types';

export type Goal = typeof goals.$inferSelect;

/**
 * Rows written before migration 0003 only have the legacy epoch `exam_date`. Resolve it to a calendar
 * day on read (a pure function of the stored value, never of the device timezone); the row itself is
 * left untouched until the goal is next saved, so no data is lost if the value cannot be converted.
 */
function withExamDay(row: Goal): Goal {
  if (row.examDay !== null || row.examDate === null) return row;
  return { ...row, examDay: legacyEpochToExamDay(row.examDate) };
}

/**
 * v1 holds exactly one active (non-deleted) goal. The invariant is enforced here, not in the
 * schema: `save` updates the live row if there is one, otherwise it creates it.
 */
export function createGoalRepository({ db, now, newId }: RepositoryDeps) {
  const live = () => {
    const row = db
      .select()
      .from(goals)
      .where(isNull(goals.deletedAt))
      .orderBy(goals.createdAt)
      .limit(1)
      .get();
    return row && withExamDay(row);
  };

  return {
    /** The active goal, or undefined when none is set. */
    getActive(): Goal | undefined {
      return live();
    },

    /** Creates the active goal or edits the existing one; never leaves two live goals. */
    save(input: GoalInput): Goal {
      const at = now();
      const existing = live();
      // The exam day is written only when the caller says so. Then (and only then) the legacy epoch is
      // retired; any other edit (title, 行動プラン check, ...) leaves `examDay` / `examDate` untouched.
      const { examDay, ...rest } = input;
      const dateValues = examDay === undefined ? {} : { examDay, examDate: null };
      const values = { ...rest, ...dateValues };
      if (existing) {
        db.update(goals)
          .set({ ...values, updatedAt: at })
          .where(eq(goals.id, existing.id))
          .run();
        return { ...existing, ...values, updatedAt: at };
      }
      const created: Goal = {
        id: newId(),
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        examDay: null,
        examDate: null,
        ...values,
      };
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
