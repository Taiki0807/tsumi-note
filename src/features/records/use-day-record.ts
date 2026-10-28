import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useRepositories } from '@/db/database-provider';

import { loadDayRecord, type DayRecordView } from './day-record';
import { buildManualSession, type ManualSessionInput, type ManualSessionResult } from './manual-session';

/** Daily records (Figma 02b): reloaded whenever the screen regains focus, e.g. after 「記録を追加」. */
export function useDayRecord(dayStart: number) {
  const repos = useRepositories();
  const [view, setView] = useState<DayRecordView | null>(null);
  useFocusEffect(
    useCallback(() => {
      setView(loadDayRecord(repos, dayStart));
    }, [repos, dayStart]),
  );
  return view;
}

/** 「記録を追加」 (Figma 02c): registers a session without the timer. Validated again against the real clock. */
export function useAddSession() {
  const repos = useRepositories();
  const folders = repos.folders.list().map(({ id, name }) => ({ id, name }));
  const add = (input: ManualSessionInput & { folderId: string | null }): ManualSessionResult => {
    const result = buildManualSession(input, Date.now());
    if (!result.ok) return result;
    repos.studySessions.record({
      id: randomUUID(),
      folderId: input.folderId,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      durationSeconds: result.durationSeconds,
    });
    return result;
  };
  return { folders, add };
}
