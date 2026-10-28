import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useRepositories } from '@/db/database-provider';

import { loadWeeklyRecord, type WeeklyRecordView } from './load-weekly-record';
import { buildManualSession, type ManualSessionInput, type ManualSessionResult } from './manual-session';
import { addWeeks, startOfLocalDay, startOfWeek } from './records-logic';

/**
 * Loads the selected week from SQLite every time the 記録 tab gains focus, so a session saved by
 * the timer shows up without restarting the app (no polling).
 */
export function useWeeklyRecord() {
  const repos = useRepositories();
  const [now, setNow] = useState(() => Date.now());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()));
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<WeeklyRecordView | null>(null);

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const current = loadWeeklyRecord(repos, weekStart, folderId);
      // A folder that was deleted meanwhile falls back to 「すべて」.
      if (folderId !== undefined && !current.folders.some((f) => f.id === folderId)) {
        setFolderId(undefined);
        return;
      }
      setView(current);
    }, [repos, weekStart, folderId]),
  );

  /** 手動記録 (no timer). Idempotent through the generated id; reloads the week afterwards. */
  const addManualSession = (input: ManualSessionInput & { folderId: string | null }): ManualSessionResult => {
    const at = Date.now();
    const result = buildManualSession(input, at);
    if (!result.ok) return result;
    repos.studySessions.record({
      id: randomUUID(),
      folderId: input.folderId,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      durationSeconds: result.durationSeconds,
    });
    setNow(at);
    setView(loadWeeklyRecord(repos, weekStart, folderId));
    return result;
  };

  const currentWeekStart = startOfWeek(now);
  return {
    addManualSession,
    view,
    weekStart,
    folderId,
    today: startOfLocalDay(now),
    isCurrentWeek: weekStart >= currentWeekStart,
    selectFolder: setFolderId,
    previousWeek: () => setWeekStart((w) => addWeeks(w, -1)),
    nextWeek: () => setWeekStart((w) => Math.min(addWeeks(w, 1), currentWeekStart)),
  };
}
