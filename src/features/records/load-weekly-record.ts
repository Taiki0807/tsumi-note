import type { Repositories } from '@/db/repositories';

import {
  addWeeks,
  buildUnderstanding,
  buildWeeklyRecord,
  type Understanding,
  type WeeklyRecord,
} from './records-logic';

type RecordsRepos = Pick<Repositories, 'studySessions' | 'folders' | 'review'>;

export type WeeklyRecordView = {
  record: WeeklyRecord;
  /** 「今週の理解度」 of the same week and folder filter, from Answer History. */
  understanding: Understanding;
  folders: { id: string; name: string }[];
};

/**
 * Use case: reads the selected week and the week before it from SQLite and aggregates them.
 * Every row in `study_sessions` is a completed focus session (Phase 2 never stores paused,
 * reset or unfinished ones), so no extra status filter is needed here.
 */
export function loadWeeklyRecord(
  { studySessions, folders, review }: RecordsRepos,
  weekStart: number,
  folderId?: string,
): WeeklyRecordView {
  const sessions = studySessions.listBetween(addWeeks(weekStart, -1), addWeeks(weekStart, 1));
  return {
    record: buildWeeklyRecord(sessions, weekStart, folderId),
    understanding: buildUnderstanding(
      review.listAnswersBetween(weekStart, addWeeks(weekStart, 1), folderId),
      weekStart,
    ),
    folders: folders.list().map(({ id, name }) => ({ id, name })),
  };
}
