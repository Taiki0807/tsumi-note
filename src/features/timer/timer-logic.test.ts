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
    const s = start(createIdleState(settings), settings, T0);
    expect(s).toMatchObject({ status: 'running', phase: 'focus', round: 1, targetEndAt: T0 + 25 * MIN });
  });

  it('pause keeps the remaining time and resume computes a new target', () => {
    const running = start(createIdleState(settings), settings, T0);
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
  const running = start(createIdleState(settings), settings, T0);

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
    expect(r.completedFocus).toEqual([{ startedAt: T0, endedAt: T0 + 25 * MIN }]);
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
    expect(r.completedFocus[1]).toEqual({ startedAt: T0 + 30 * MIN, endedAt: T0 + 55 * MIN });
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
    const running = start(createIdleState(settings), settings, T0);
    expect(planBoundaries(running)).toEqual([
      { at: T0 + 25 * MIN, event: 'focusEnd' },
      { at: T0 + 30 * MIN, event: 'breakEnd' },
      { at: T0 + 55 * MIN, event: 'allDone' },
    ]);
    expect(planBoundaries(pause(running, T0))).toEqual([]);
  });
});

describe('formatRemaining', () => {
  it('formats mm:ss', () => {
    expect(formatRemaining(25 * MIN)).toBe('25:00');
    expect(formatRemaining(61_500)).toBe('01:02');
  });
});
