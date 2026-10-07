import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useRepositories } from '@/db/database-provider';

import {
  advance,
  createIdleState,
  getProgress,
  getRemainingMs,
  pause,
  reset,
  resume,
  start,
  type TimerSettings,
  type TimerState,
} from './timer-logic';
import {
  ensureNotificationPermission,
  notifyHaptic,
  syncTimerNotifications,
} from './timer-notifications';
import { createTimerStorage } from './timer-storage';

/** Timer State / Hook: glues pure logic to storage, notifications and AppState. */
export function useTimer() {
  const repos = useRepositories();
  const storage = useMemo(() => createTimerStorage(repos), [repos]);

  const [settings, setSettings] = useState<TimerSettings>(() => storage.loadSettings());
  const [state, setState] = useState<TimerState>(() => {
    const restored = storage.loadState();
    return restored ?? createIdleState(storage.loadSettings());
  });
  const [now, setNow] = useState(() => Date.now());
  const stateRef = useRef(state);

  /** Applies a new state: persists it, keeps notifications in sync and saves finished focuses. */
  const commit = useCallback(
    (next: TimerState, at: number) => {
      stateRef.current = next;
      setState(next);
      setNow(at);
      storage.saveState(next);
      void syncTimerNotifications(next, at);
    },
    [storage],
  );

  /** Recomputes from the wall clock; used by the ticker, foreground return and relaunch. */
  const sync = useCallback(() => {
    const at = Date.now();
    const result = advance(stateRef.current, at);
    if (result.completedFocus.length > 0) storage.recordCompletedFocus(result.completedFocus);
    const last = result.events[result.events.length - 1];
    if (last) notifyHaptic(last);
    if (result.state !== stateRef.current) commit(result.state, at);
    else setNow(at);
  }, [commit, storage]);

  // Relaunch while running / finished in the background: catch up once on mount.
  useEffect(() => {
    sync();
  }, [sync]);

  // The interval only repaints; correctness comes from `targetEndAt - Date.now()`.
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(sync, 250);
    return () => clearInterval(id);
  }, [state.status, sync]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') sync();
    });
    return () => sub.remove();
  }, [sync]);

  const onStart = useCallback(() => {
    void ensureNotificationPermission().then(() => {
      // Permission is asked first; scheduling happens in commit and is skipped if denied.
      const at = Date.now();
      commit(start(stateRef.current, settings, at, randomUUID), at);
    });
  }, [commit, settings]);

  const onPause = useCallback(() => {
    const at = Date.now();
    commit(pause(stateRef.current, at), at);
  }, [commit]);

  const onResume = useCallback(() => {
    const at = Date.now();
    commit(resume(stateRef.current, at), at);
  }, [commit]);

  const onReset = useCallback(() => commit(reset(settings), Date.now()), [commit, settings]);

  const updateSettings = useCallback(
    (next: TimerSettings) => {
      const saved = storage.saveSettings(next);
      setSettings(saved);
      // A session in progress keeps its own snapshot; an idle timer shows the new length.
      if (stateRef.current.status === 'idle' || stateRef.current.status === 'completed') {
        commit(createIdleState(saved), Date.now());
      }
    },
    [commit, storage],
  );

  return {
    state,
    settings,
    remainingMs: getRemainingMs(state, now),
    progress: getProgress(state, now),
    onStart,
    onPause,
    onResume,
    onReset,
    updateSettings,
  };
}
