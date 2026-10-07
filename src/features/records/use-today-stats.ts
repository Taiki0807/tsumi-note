import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useRepositories } from '@/db/database-provider';

import { loadTodayStats } from './load-today-stats';
import { addDays, startOfLocalDay, type DaySummary } from './records-logic';

/**
 * Today's stats from SQLite. Re-reads on focus, when `refreshKey` changes (a focus session was
 * just saved), when the app returns to the foreground and at local midnight.
 */
export function useTodayStats(refreshKey: number): DaySummary {
  const repos = useRepositories();
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  // Wake up just after the next local midnight so the new day starts from zero.
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), addDays(startOfLocalDay(now), 1) - now + 1000);
    return () => clearTimeout(id);
  }, [now]);

  // `refreshKey` is intentionally a dependency: it forces a re-read after a session was saved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => loadTodayStats(repos, now), [repos, now, refreshKey]);
}
