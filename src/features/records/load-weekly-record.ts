import type { Repositories } from '@/db/repositories';

import {
  addWeeks,
  buildNeedsReview,
  buildUnderstanding,
  buildWeeklyRecord,
  type NeedsReview,
  type Understanding,
  type WeeklyRecord,
} from './records-logic';

type RecordsRepos = Pick<Repositories, 'studySessions' | 'folders' | 'review'>;

export type WeeklyRecordView = {
  record: WeeklyRecord;
  /** 「今週の理解度」 of the same week and folder filter, from Answer History. */
  understanding: Understanding;
  /** 「今週の要復習」: highest error-rate question of the same week and folder filter. */
  needsReview: NeedsReview | null;
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
  const answers = review.listAnswersBetween(weekStart, addWeeks(weekStart, 1), folderId);
  return {
    record: buildWeeklyRecord(sessions, weekStart, folderId),
    understanding: buildUnderstanding(answers, weekStart),
    needsReview: buildNeedsReview(answers, weekStart),
    folders: folders.list().map(({ id, name }) => ({ id, name })),
  };
}
