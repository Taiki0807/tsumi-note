import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useRepositories } from '@/db/database-provider';

import { loadDayRecord, type DayRecordView } from './day-record';
import {
  buildEditedSession,
  buildManualSession,
  type ManualSessionInput,
  type ManualSessionResult,
} from './manual-session';

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

/** 記録の編集: the stored session plus `save` (validated again against the real clock). */
export function useEditSession(sessionId: string) {
  const repos = useRepositories();
  const folders = repos.folders.list().map(({ id, name, color }) => ({ id, name, color }));
  const session = repos.studySessions.getById(sessionId);
  const save = (input: ManualSessionInput & { folderId: string | null }): ManualSessionResult => {
    if (!session) return { ok: false, error: 'この記録は見つかりませんでした' };
    const result = buildEditedSession(input, Date.now(), session);
    if (!result.ok) return result;
    const updated = repos.studySessions.update(sessionId, {
      folderId: input.folderId,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      durationSeconds: result.durationSeconds,
    });
    return updated ? result : { ok: false, error: 'この記録は見つかりませんでした' };
  };
  return { folders, session, save };
}

/** 「記録を追加」 (Figma 02c): registers a session without the timer. Validated again against the real clock. */
export function useAddSession() {
  const repos = useRepositories();
  const folders = repos.folders.list().map(({ id, name, color }) => ({ id, name, color }));
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
