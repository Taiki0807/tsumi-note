/**
 * Timer domain logic (docs/ARCHITECTURE.md §11). Pure functions only: no React, no DB, no
 * notifications. The remaining time is always derived from `targetEndAt - now`, never from a
 * tick counter, so Background / Foreground / relaunch all recompute from the wall clock.
 */

export type TimerSettings = {
  focusMinutes: number;
  breakMinutes: number;
  rounds: number;
};

export const DEFAULT_TIMER_SETTINGS: TimerSettings = { focusMinutes: 25, breakMinutes: 5, rounds: 4 };

export const TIMER_LIMITS = {
  focusMinutes: { min: 1, max: 180 },
  breakMinutes: { min: 1, max: 60 },
  rounds: { min: 1, max: 12 },
} as const;

export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
export type TimerPhase = 'focus' | 'break';

export type TimerState = {
  status: TimerStatus;
  phase: TimerPhase;
  /** 1-based current round. */
  round: number;
  /** Settings snapshot taken at `start`, so editing settings never alters a running session. */
  settings: TimerSettings;
  /** Unique id of this timer run (generated at `start`, kept across pause / relaunch). */
  runId: string | null;
  /**
   * Id of the current focus session: `${runId}:${round}`. Stable for the whole focus phase and
   * across relaunch, so completing it twice maps to the same study_sessions row.
   */
  sessionId: string | null;
  /**
   * Folder chosen when the run started (null = unclassified). Part of the run's snapshot, like
   * `settings`: changing the picker for the next run never alters a run in progress.
   */
  folderId: string | null;
  /** Epoch ms when the current focus session actually began. Never changed by pause / resume. */
  focusStartedAt: number | null;
  /** Epoch ms when the current phase ends. Only meaningful while `running`. */
  targetEndAt: number | null;
  /** Remaining ms of the current phase. Authoritative while idle / paused. */
  remainingMs: number;
};

export type TimerEvent = 'focusEnd' | 'breakEnd' | 'allDone';

/** A focus session that ran to completion. Only these may be persisted as study sessions. */
export type CompletedFocus = {
  /** Idempotency key: becomes the study_sessions primary key. */
  sessionId: string;
  /** Folder fixed at run start; null = unclassified. */
  folderId: string | null;
  /** Actual wall-clock start / end. They include time spent paused. */
  startedAt: number;
  endedAt: number;
  /** Focused time in seconds (the configured focus length, excluding pauses). */
  durationSeconds: number;
};

export type AdvanceResult = {
  state: TimerState;
  completedFocus: CompletedFocus[];
  events: TimerEvent[];
};

const MINUTE = 60_000;

export function clampSettings(input: Partial<TimerSettings>): TimerSettings {
  const pick = (key: keyof TimerSettings) => {
    const { min, max } = TIMER_LIMITS[key];
    const value = Math.round(Number(input[key]));
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : DEFAULT_TIMER_SETTINGS[key];
  };
  return { focusMinutes: pick('focusMinutes'), breakMinutes: pick('breakMinutes'), rounds: pick('rounds') };
}

export function phaseDurationMs(settings: TimerSettings, phase: TimerPhase): number {
  return (phase === 'focus' ? settings.focusMinutes : settings.breakMinutes) * MINUTE;
}

export function createIdleState(settings: TimerSettings): TimerState {
  return {
    status: 'idle',
    phase: 'focus',
    round: 1,
    settings,
    runId: null,
    sessionId: null,
    folderId: null,
    focusStartedAt: null,
    targetEndAt: null,
    remainingMs: phaseDurationMs(settings, 'focus'),
  };
}

export function focusSessionId(runId: string, round: number): string {
  return `${runId}:${round}`;
}

/** `newId` generates the run id (UUID in the app); it is called exactly once per start. */
export function start(
  state: TimerState,
  settings: TimerSettings,
  now: number,
  newId: () => string,
  folderId: string | null = null,
): TimerState {
  if (state.status === 'running' || state.status === 'paused') return state;
  const fresh = createIdleState(settings);
  const runId = newId();
  return {
    ...fresh,
    status: 'running',
    runId,
    folderId,
    sessionId: focusSessionId(runId, 1),
    focusStartedAt: now,
    targetEndAt: now + fresh.remainingMs,
  };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  return { ...state, status: 'paused', targetEndAt: null, remainingMs: getRemainingMs(state, now) };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'running', targetEndAt: now + state.remainingMs };
}

/** Discards the session. Nothing is saved: an unfinished focus is not a completed record. */
export function reset(settings: TimerSettings): TimerState {
  return createIdleState(settings);
}

export function getRemainingMs(state: TimerState, now: number): number {
  if (state.status === 'running' && state.targetEndAt !== null) {
    return Math.max(0, state.targetEndAt - now);
  }
  return state.remainingMs;
}

/**
 * Applies every phase boundary that has passed by `now` (a long background stay may cross
 * several). Boundaries are chained from `targetEndAt`, not from `now`, so the result is exact.
 */
export function advance(state: TimerState, now: number): AdvanceResult {
  let current = state;
  const completedFocus: CompletedFocus[] = [];
  const events: TimerEvent[] = [];

  while (current.status === 'running' && current.targetEndAt !== null && now >= current.targetEndAt) {
    const endedAt: number = current.targetEndAt;
    const { settings } = current;

    if (current.phase === 'focus') {
      if (current.sessionId !== null && current.focusStartedAt !== null) {
        completedFocus.push({
          sessionId: current.sessionId,
          folderId: current.folderId ?? null,
          startedAt: current.focusStartedAt,
          endedAt,
          durationSeconds: Math.round(phaseDurationMs(settings, 'focus') / 1000),
        });
      }
      if (current.round >= settings.rounds) {
        events.push('allDone');
        current = {
          ...current,
          status: 'completed',
          sessionId: null,
          focusStartedAt: null,
          targetEndAt: null,
          remainingMs: 0,
        };
      } else {
        events.push('focusEnd');
        current = {
          ...current,
          phase: 'break',
          sessionId: null,
          focusStartedAt: null,
          targetEndAt: endedAt + phaseDurationMs(settings, 'break'),
          remainingMs: phaseDurationMs(settings, 'break'),
        };
      }
    } else {
      events.push('breakEnd');
      current = {
        ...current,
        phase: 'focus',
        round: current.round + 1,
        // The next focus really begins when the break ended, even if we only notice later.
        sessionId: current.runId === null ? null : focusSessionId(current.runId, current.round + 1),
        focusStartedAt: endedAt,
        targetEndAt: endedAt + phaseDurationMs(settings, 'focus'),
        remainingMs: phaseDurationMs(settings, 'focus'),
      };
    }
  }
  return { state: current, completedFocus, events };
}

/** Future phase boundaries of a running timer, used to schedule local notifications. */
export function planBoundaries(state: TimerState): { at: number; event: TimerEvent }[] {
  if (state.status !== 'running' || state.targetEndAt === null) return [];
  const plan: { at: number; event: TimerEvent }[] = [];
  let at = state.targetEndAt;
  let { phase, round } = state;
  const { settings } = state;
  for (;;) {
    if (phase === 'focus') {
      if (round >= settings.rounds) {
        plan.push({ at, event: 'allDone' });
        return plan;
      }
      plan.push({ at, event: 'focusEnd' });
      at += phaseDurationMs(settings, 'break');
      phase = 'break';
    } else {
      plan.push({ at, event: 'breakEnd' });
      at += phaseDurationMs(settings, 'focus');
      phase = 'focus';
      round += 1;
    }
  }
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 0..1 progress of the current phase, for the ring. */
export function getProgress(state: TimerState, now: number): number {
  const total = phaseDurationMs(state.settings, state.phase);
  return total === 0 ? 0 : 1 - getRemainingMs(state, now) / total;
}

/** Persistence: restores a stored state and rejects malformed JSON. */
export function parseStoredState(raw: string | undefined): TimerState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as TimerState;
    const okStatus = ['idle', 'running', 'paused', 'completed'].includes(v.status);
    const okPhase = v.phase === 'focus' || v.phase === 'break';
    if (!okStatus || !okPhase || !Number.isFinite(v.round) || !Number.isFinite(v.remainingMs)) return null;
    if (v.status === 'running' && !Number.isFinite(v.targetEndAt)) return null;
    // An in-flight run without its identity can't be recorded safely: fall back to idle.
    if (v.status === 'running' || v.status === 'paused') {
      if (typeof v.runId !== 'string' || v.runId === '') return null;
      if (v.phase === 'focus') {
        if (typeof v.sessionId !== 'string' || !Number.isFinite(v.focusStartedAt)) return null;
      }
    }
    // States stored before the folder link existed have no folderId: treat as unclassified.
    const folderId = typeof v.folderId === 'string' && v.folderId !== '' ? v.folderId : null;
    return { ...v, folderId, settings: clampSettings(v.settings) };
  } catch {
    return null;
  }
}
