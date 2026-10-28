import type { Repositories } from '@/db/repositories';

import { addDays } from './records-logic';

export type DaySession = {
  id: string;
  folderId: string | null;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
};

export type FolderShare = { folderId: string | null; seconds: number };

export type DayRecordView = {
  totalSeconds: number;
  /** Chronological (earliest first), as 「時刻ごとの記録」 lists them. */
  sessions: DaySession[];
  /** Time per folder, in the order of the folder list (未分類 last). */
  shares: FolderShare[];
  folders: { id: string; name: string }[];
};

/** Pure: groups one day's sessions (Figma 02b 日別の記録). */
export function buildDayRecord(
  sessions: DaySession[],
  folders: { id: string; name: string }[],
): Omit<DayRecordView, 'folders'> {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const byFolder = new Map<string | null, number>();
  for (const s of sorted) byFolder.set(s.folderId, (byFolder.get(s.folderId) ?? 0) + s.durationSeconds);
  const shares: FolderShare[] = [
    ...folders
      .filter((f) => byFolder.has(f.id))
      .map((f) => ({ folderId: f.id as string | null, seconds: byFolder.get(f.id) ?? 0 })),
    ...(byFolder.has(null) ? [{ folderId: null, seconds: byFolder.get(null) ?? 0 }] : []),
    // A session whose folder was removed from the list still counts toward the total.
    ...[...byFolder]
      .filter(([id]) => id !== null && !folders.some((f) => f.id === id))
      .map(([id, seconds]) => ({ folderId: id, seconds })),
  ];
  return { totalSeconds: sorted.reduce((sum, s) => sum + s.durationSeconds, 0), sessions: sorted, shares };
}

/** Use case: the sessions that started on the local day starting at `dayStart`. */
export function loadDayRecord(
  { studySessions, folders }: Pick<Repositories, 'studySessions' | 'folders'>,
  dayStart: number,
): DayRecordView {
  const folderList = folders.list().map(({ id, name }) => ({ id, name }));
  const sessions = studySessions.listBetween(dayStart, addDays(dayStart, 1));
  return { ...buildDayRecord(sessions, folderList), folders: folderList };
}
