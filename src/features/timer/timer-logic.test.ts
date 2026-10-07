import {
  advance,
  clampSettings,
  createIdleState,
  DEFAULT_TIMER_SETTINGS,
  formatRemaining,
  getRemainingMs,
  pause,
  planBoundaries,
  reset,
  resume,
  start,
  type TimerSettings,
} from './timer-logic';

const MIN = 60_000;
const newId = () => 'run-1';
const T0 = 1_000_000;
const settings: TimerSettings = { focusMinutes: 25, breakMinutes: 5, rounds: 2 };

describe('defaults', () => {
  it('are 25 / 5 / 4', () => {
    expect(DEFAULT_TIMER_SETTINGS).toEqual({ focusMinutes: 25, breakMinutes: 5, rounds: 4 });
  });
  it('clamps invalid settings', () => {
    expect(clampSettings({ focusMinutes: 0, breakMinutes: 999, rounds: NaN })).toEqual({
      focusMinutes: 1,
      breakMinutes: 60,
      rounds: 4,
    });
  });
});

describe('start / pause / resume / reset', () => {
  it('start runs a focus phase ending at now + focus', () => {
    const s = start(createIdleState(settings), settings, T0, newId);
    expect(s).toMatchObject({ status: 'running', phase: 'focus', round: 1, targetEndAt: T0 + 25 * MIN });
  });

  it('start generates a run / session id and keeps the real startedAt', () => {
    const s = start(createIdleState(settings), settings, T0, newId);
    expect(s).toMatchObject({ runId: 'run-1', sessionId: 'run-1:1', focusStartedAt: T0 });
  });

  it('pause and resume never change startedAt or sessionId', () => {
    const running = start(createIdleState(settings), settings, T0, newId);
    const paused = pause(running, T0 + 10 * MIN);
    const resumed = resume(paused, T0 + 20 * MIN);
    for (const s of [paused, resumed]) {
      expect(s).toMatchObject({ runId: 'run-1', sessionId: 'run-1:1', focusStartedAt: T0 });
    }
  });

  it('start is a no-op while running / paused (no new session id)', () => {
    const running = start(createIdleState(settings), settings, T0, newId);
    expect(start(running, settings, T0 + MIN, () => 'other')).toBe(running);
  });

  it('a new start after reset gets a different run id', () => {
    const first = start(createIdleState(settings), settings, T0, newId);
    const second = start(reset(settings), settings, T0 + MIN, () => 'run-2');
    expect(second.sessionId).toBe('run-2:1');
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('pause keeps the remaining time and resume computes a new target', () => {
    const running = start(createIdleState(settings), settings, T0, newId);
    const paused = pause(running, T0 + 10 * MIN);
    expect(paused).toMatchObject({ status: 'paused', remainingMs: 15 * MIN, targetEndAt: null });
    // time spent paused (even in background) does not count
    expect(getRemainingMs(paused, T0 + 60 * MIN)).toBe(15 * MIN);
    const resumed = resume(paused, T0 + 60 * MIN);
    expect(resumed.targetEndAt).toBe(T0 + 75 * MIN);
  });

  it('reset returns to idle with the configured focus time', () => {
    expect(reset(settings)).toEqual(createIdleState(settings));
  });
});

describe('advance', () => {
  const running = start(createIdleState(settings), settings, T0, newId);

  it('does nothing before the target', () => {
    const r = advance(running, T0 + 25 * MIN - 1);
    expect(r.state).toBe(running);
    expect(r.completedFocus).toEqual([]);
  });

  it('focus end -> break, and records the completed focus', () => {
    const r = advance(running, T0 + 25 * MIN);
    expect(r.state).toMatchObject({
      phase: 'break',
      round: 1,
      status: 'running',
      targetEndAt: T0 + 30 * MIN,
    });
    expect(r.events).toEqual(['focusEnd']);
    expect(r.completedFocus).toEqual([
      { sessionId: 'run-1:1', startedAt: T0, endedAt: T0 + 25 * MIN, durationSeconds: 25 * 60 },
    ]);
  });

  it('does not derive startedAt from endedAt - duration when paused in between', () => {
    const paused = pause(running, T0 + 10 * MIN);
    const resumed = resume(paused, T0 + 40 * MIN); // 30 min spent paused
    const r = advance(resumed, T0 + 55 * MIN);
    const done = r.completedFocus[0]!;
    expect(done.startedAt).toBe(T0);
    expect(done.endedAt).toBe(T0 + 55 * MIN);
    expect(done.startedAt).not.toBe(done.endedAt - 25 * MIN);
    expect(done.durationSeconds).toBe(25 * 60);
  });

  it('each focus round gets its own session id, and sessionId is stable within a round', () => {
    const r = advance(running, T0 + 55 * MIN);
    expect(r.completedFocus.map((c) => c.sessionId)).toEqual(['run-1:1', 'run-1:2']);
    const midRound2 = advance(running, T0 + 40 * MIN).state;
    expect(midRound2.sessionId).toBe('run-1:2');
    expect(advance(midRound2, T0 + 41 * MIN).state.sessionId).toBe('run-1:2');
  });

  it('break end -> next focus round, no focus recorded', () => {
    const inBreak = advance(running, T0 + 25 * MIN).state;
    const r = advance(inBreak, T0 + 30 * MIN);
    expect(r.state).toMatchObject({ phase: 'focus', round: 2, targetEndAt: T0 + 55 * MIN });
    expect(r.events).toEqual(['breakEnd']);
    expect(r.completedFocus).toEqual([]);
  });

  it('final round completes the whole session without a trailing break', () => {
    const r = advance(running, T0 + 55 * MIN);
    expect(r.state.status).toBe('completed');
    expect(r.events).toEqual(['focusEnd', 'breakEnd', 'allDone']);
    expect(r.completedFocus).toHaveLength(2);
    expect(r.completedFocus[1]).toEqual({
      sessionId: 'run-1:2',
      startedAt: T0 + 30 * MIN,
      endedAt: T0 + 55 * MIN,
      durationSeconds: 25 * 60,
    });
  });

  it('catches up exactly after a long background stay', () => {
    const r = advance(running, T0 + 40 * MIN);
    expect(r.state).toMatchObject({ phase: 'focus', round: 2, targetEndAt: T0 + 55 * MIN });
    expect(getRemainingMs(r.state, T0 + 40 * MIN)).toBe(15 * MIN);
  });

  it('never records a session for paused, idle or reset timers', () => {
    const paused = pause(running, T0 + 24 * MIN);
    expect(advance(paused, T0 + 999 * MIN).completedFocus).toEqual([]);
    expect(advance(createIdleState(settings), T0 + 999 * MIN).completedFocus).toEqual([]);
    expect(advance(reset(settings), T0 + 999 * MIN).completedFocus).toEqual([]);
  });

  it('is idempotent once completed', () => {
    const done = advance(running, T0 + 55 * MIN).state;
    expect(advance(done, T0 + 99 * MIN).completedFocus).toEqual([]);
  });
});

describe('planBoundaries', () => {
  it('lists every future boundary ending with allDone', () => {
    const running = start(createIdleState(settings), settings, T0, newId);
    expect(planBoundaries(running)).toEqual([
      { at: T0 + 25 * MIN, event: 'focusEnd' },
      { at: T0 + 30 * MIN, event: 'breakEnd' },
      { at: T0 + 55 * MIN, event: 'allDone' },
    ]);
    expect(planBoundaries(pause(running, T0))).toEqual([]);
  });
});

describe('settings edited during a session', () => {
  const edited: TimerSettings = { focusMinutes: 10, breakMinutes: 2, rounds: 3 };

  it('running / paused keep the start snapshot (rounds, focus, break) for display and progress', () => {
    const running = start(createIdleState(settings), settings, T0, newId);
    const paused = pause(running, T0 + 5 * MIN);
    for (const s of [running, paused, resume(paused, T0 + 6 * MIN)]) {
      // The UI shows `state.settings.rounds`, which is unaffected by the edited value.
      expect(s.settings).toEqual(settings);
      expect(s.settings.rounds).toBe(2);
    }
  });

  it('completes using the snapshot even though newer settings exist', () => {
    const running = start(createIdleState(settings), settings, T0, newId);
    // `edited` is saved while running, but never reaches the state.
    const result = advance(running, T0 + 55 * MIN);
    expect(result.state.status).toBe('completed');
    expect(result.completedFocus).toHaveLength(2);
    expect(result.completedFocus.every((f) => f.durationSeconds === 25 * 60)).toBe(true);
    expect(planBoundaries(running)).toHaveLength(3);
  });

  it('applies the edited settings from the next start', () => {
    const running = start(createIdleState(settings), settings, T0, newId);
    const done = advance(running, T0 + 55 * MIN).state;
    const next = start(done, edited, T0 + 60 * MIN, () => 'run-2');
    expect(next.settings).toEqual(edited);
    expect(next.targetEndAt).toBe(T0 + 70 * MIN);
    expect(planBoundaries(next)).toHaveLength(5);
    expect(start(reset(edited), edited, T0, newId).settings.rounds).toBe(3);
  });
});

describe('formatRemaining', () => {
  it('formats mm:ss', () => {
    expect(formatRemaining(25 * MIN)).toBe('25:00');
    expect(formatRemaining(61_500)).toBe('01:02');
  });
});
