import type { Repositories } from '@/db/repositories';

import {
  clampSettings,
  DEFAULT_TIMER_SETTINGS,
  parseStoredState,
  type CompletedFocus,
  type TimerSettings,
  type TimerState,
} from './timer-logic';

const KEYS = {
  focusMinutes: 'timer.focusMinutes',
  breakMinutes: 'timer.breakMinutes',
  rounds: 'timer.rounds',
  state: 'timer.state',
  folderId: 'timer.folderId',
} as const;

type TimerRepos = Pick<Repositories, 'settings' | 'studySessions' | 'folders'>;

/** Repository-backed persistence for the timer. Fully local; no network involved. */
export function createTimerStorage({ settings, studySessions, folders }: TimerRepos) {
  return {
    /** Live (not deleted) folders, the only candidates for the picker. */
    listFolders(): { id: string; name: string }[] {
      return folders.list().map(({ id, name }) => ({ id, name }));
    },

    /**
     * Folder for the NEXT run (the picker value). Unselected / deleted / unknown → null
     * (未分類), so a stale id can never be attached to a new session.
     */
    loadSelectedFolderId(): string | null {
      const id = settings.get(KEYS.folderId);
      if (!id) return null;
      return folders.list().some((f) => f.id === id) ? id : null;
    },

    saveSelectedFolderId(folderId: string | null): void {
      settings.set(KEYS.folderId, folderId ?? '');
    },

    loadSettings(): TimerSettings {
      const read = (key: keyof TimerSettings) => {
        const raw = settings.get(KEYS[key]);
        return raw === undefined ? DEFAULT_TIMER_SETTINGS[key] : Number(raw);
      };
      return clampSettings({
        focusMinutes: read('focusMinutes'),
        breakMinutes: read('breakMinutes'),
        rounds: read('rounds'),
      });
    },

    saveSettings(input: TimerSettings): TimerSettings {
      const value = clampSettings(input);
      settings.set(KEYS.focusMinutes, String(value.focusMinutes));
      settings.set(KEYS.breakMinutes, String(value.breakMinutes));
      settings.set(KEYS.rounds, String(value.rounds));
      return value;
    },

    /** The in-flight timer, so a relaunch can recompute the remaining time from the wall clock. */
    loadState(): TimerState | null {
      return parseStoredState(settings.get(KEYS.state));
    },

    saveState(state: TimerState): void {
      settings.set(KEYS.state, JSON.stringify(state));
    },

    /**
     * Only focus sessions that ran to completion are passed in. Each carries the folderId fixed
     * when its run started (null = unclassified).
     * Idempotent: `sessionId` is the primary key, so repeated calls keep one row per session.
     */
    recordCompletedFocus(sessions: CompletedFocus[]): void {
      for (const s of sessions) {
        studySessions.record({
          id: s.sessionId,
          folderId: s.folderId ?? null,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          durationSeconds: s.durationSeconds,
        });
      }
    },
  };
}

export type TimerStorage = ReturnType<typeof createTimerStorage>;
