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
  /** Epoch ms when the current phase ends. Only meaningful while `running`. */
  targetEndAt: number | null;
  /** Remaining ms of the current phase. Authoritative while idle / paused. */
  remainingMs: number;
};

export type TimerEvent = 'focusEnd' | 'breakEnd' | 'allDone';

/** A focus session that ran to completion. Only these may be persisted as study sessions. */
export type CompletedFocus = { startedAt: number; endedAt: number };

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
    targetEndAt: null,
    remainingMs: phaseDurationMs(settings, 'focus'),
  };
}

export function start(state: TimerState, settings: TimerSettings, now: number): TimerState {
  if (state.status === 'running' || state.status === 'paused') return state;
  const fresh = createIdleState(settings);
  return { ...fresh, status: 'running', targetEndAt: now + fresh.remainingMs };
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
      completedFocus.push({ startedAt: endedAt - phaseDurationMs(settings, 'focus'), endedAt });
      if (current.round >= settings.rounds) {
        events.push('allDone');
        current = { ...current, status: 'completed', targetEndAt: null, remainingMs: 0 };
      } else {
        events.push('focusEnd');
        current = {
          ...current,
          phase: 'break',
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
    return { ...v, settings: clampSettings(v.settings) };
  } catch {
    return null;
  }
}
