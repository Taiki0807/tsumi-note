import type { Repositories } from '@/db/repositories';

import { addDays, startOfLocalDay, summarizeDay, type DaySummary } from './records-logic';

/**
 * Use case: today's (device-local day) completed focus sessions for the timer screen.
 * Uses the same Repository read and `summarizeDay` aggregation as the 記録 tab; the day is
 * derived from `now` on every call, so a new local day starts from zero.
 */
export function loadTodayStats(
  { studySessions }: Pick<Repositories, 'studySessions'>,
  now: number,
): DaySummary {
  const dayStart = startOfLocalDay(now);
  return summarizeDay(studySessions.listBetween(dayStart, addDays(dayStart, 1)), dayStart);
}
