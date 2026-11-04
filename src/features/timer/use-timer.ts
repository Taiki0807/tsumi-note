import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useRepositories } from '@/db/database-provider';
import { withAlarmMode, type TimerAlarmMode } from '@/domain/app-settings';
import { loadTimerAlerts, saveTimerAlerts } from '@/features/settings/settings-use-cases';

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
  configureTimerAlerts,
  ensureNotificationPermission,
  notifyHaptic,
  syncTimerNotifications,
} from './timer-notifications';
import { createTimerStorage } from './timer-storage';

function isSameSettings(a: TimerSettings, b: TimerSettings): boolean {
  return a.focusMinutes === b.focusMinutes && a.breakMinutes === b.breakMinutes && a.rounds === b.rounds;
}

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
  /** Picker value for the NEXT run. A run in progress keeps `state.folderId` (snapshot at start). */
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() =>
    storage.loadSelectedFolderId(),
  );
  const [folders, setFolders] = useState(() => storage.listFolders());
  const selectedRef = useRef(selectedFolderId);
  /** Bumped whenever finished focus sessions were saved, so stats derived from SQLite reload. */
  const [savedCount, setSavedCount] = useState(0);
  const stateRef = useRef(state);
  const [alerts, setAlerts] = useState(() => loadTimerAlerts(repos));

  /** Applies a new state: persists it, keeps notifications in sync and saves finished focuses. */
  const commit = useCallback(
    (next: TimerState, at: number, keepRingingAlarm = false) => {
      stateRef.current = next;
      setState(next);
      setNow(at);
      storage.saveState(next);
      void syncTimerNotifications(next, at, { keepRingingAlarm });
    },
    [storage],
  );

  /**
   * Recomputes from the wall clock; used by the ticker, foreground return and relaunch.
   * `stopAlarm`: the user just came back to the app, so a 長め alarm still queued is cancelled; the ticker
   * leaves it ringing instead (otherwise crossing a boundary in the foreground would cut it after one sound).
   */
  const sync = useCallback(
    (stopAlarm = false) => {
      const at = Date.now();
      const result = advance(stateRef.current, at);
      if (result.completedFocus.length > 0) {
        storage.recordCompletedFocus(result.completedFocus);
        setSavedCount((c) => c + 1);
      }
      const last = result.events[result.events.length - 1];
      if (last) notifyHaptic(last);
      if (result.state !== stateRef.current) commit(result.state, at, !stopAlarm && last !== undefined);
      else setNow(at);
    },
    [commit, storage],
  );

  // Relaunch while running / finished in the background: catch up once on mount.
  useEffect(() => {
    sync(true);
  }, [sync]);

  // The interval only repaints; correctness comes from `targetEndAt - Date.now()`.
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(() => sync(), 250);
    return () => clearInterval(id);
  }, [state.status, sync]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') sync(true);
    });
    return () => sub.remove();
  }, [sync]);

  const onStart = useCallback(() => {
    void ensureNotificationPermission().then(() => {
      // Permission is asked first; scheduling happens in commit and is skipped if denied.
      const at = Date.now();
      // The folder is fixed here: later picker changes only affect the next run.
      commit(start(stateRef.current, settings, at, randomUUID, selectedRef.current), at);
    });
  }, [commit, settings]);

  /** Re-reads live folders (a folder created / deleted elsewhere shows up without a restart). */
  const refreshFolders = useCallback(() => {
    setFolders(storage.listFolders());
    const id = storage.loadSelectedFolderId();
    selectedRef.current = id;
    setSelectedFolderId(id);
  }, [storage]);
  useFocusEffect(refreshFolders);

  const selectFolder = useCallback(
    (folderId: string | null) => {
      storage.saveSelectedFolderId(folderId);
      selectedRef.current = folderId;
      setSelectedFolderId(folderId);
    },
    [storage],
  );

  /** Creates a folder from the timer and selects it for the next run. Throws ValidationError on a bad name. */
  const createFolder = useCallback(
    (name: string, color?: string) => {
      const folder = repos.folders.create({ name, color });
      setFolders(storage.listFolders());
      selectFolder(folder.id);
    },
    [repos, selectFolder, storage],
  );

  const onPause = useCallback(() => {
    const at = Date.now();
    commit(pause(stateRef.current, at), at);
  }, [commit]);

  const onResume = useCallback(() => {
    const at = Date.now();
    commit(resume(stateRef.current, at), at);
  }, [commit]);

  const onReset = useCallback(() => commit(reset(settings), Date.now()), [commit, settings]);

  /** Adopts saved settings: a session in progress keeps its own snapshot; an idle timer shows the new length. */
  const applySettings = useCallback(
    (saved: TimerSettings) => {
      setSettings(saved);
      if (stateRef.current.status === 'idle' || stateRef.current.status === 'completed') {
        commit(createIdleState(saved), Date.now());
      }
    },
    [commit],
  );

  const updateSettings = useCallback(
    (next: TimerSettings) => applySettings(storage.saveSettings(next)),
    [applySettings, storage],
  );

  // 通知音 / バイブレーション are edited on マイページ › 通知. Re-apply on focus, and re-schedule so the
  // notifications already queued for a running timer carry the new sound choice.
  useFocusEffect(
    useCallback(() => {
      const stored = loadTimerAlerts(repos);
      configureTimerAlerts(stored);
      setAlerts(stored);
      void syncTimerNotifications(stateRef.current, Date.now());
    }, [repos]),
  );

  /** タイマー画面のスピーカーから: persists the アラーム mode (vibration untouched) and re-queues notifications. */
  const setAlarmMode = useCallback(
    (mode: TimerAlarmMode) => {
      const next = saveTimerAlerts(repos, withAlarmMode(alerts, mode));
      configureTimerAlerts(next);
      setAlerts(next);
      void syncTimerNotifications(stateRef.current, Date.now());
    },
    [alerts, repos],
  );

  // The settings sheet on マイページ writes the same storage; pick its changes up when this tab regains focus.
  useFocusEffect(
    useCallback(() => {
      const saved = storage.loadSettings();
      if (!isSameSettings(saved, settings)) applySettings(saved);
    }, [applySettings, settings, storage]),
  );

  return {
    state,
    settings,
    savedCount,
    folders,
    selectedFolderId,
    alarmMode: alerts.alarmMode,
    setAlarmMode,
    selectFolder,
    createFolder,
    remainingMs: getRemainingMs(state, now),
    progress: getProgress(state, now),
    onStart,
    onPause,
    onResume,
    onReset,
    updateSettings,
  };
}
