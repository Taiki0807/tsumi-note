import { createRepositories } from '@/db/repositories';
import { createTestDeps } from '@/db/test-utils';

import {
  advance,
  createIdleState,
  DEFAULT_TIMER_SETTINGS,
  pause,
  reset,
  resume,
  start,
  type TimerSettings,
} from './timer-logic';
import { createTimerStorage } from './timer-storage';

const MIN = 60_000;

function setup() {
  const repos = createRepositories(createTestDeps().deps);
  return { repos, storage: createTimerStorage(repos) };
}

const begin = (s: TimerSettings, at: number, runId = 'run-1') =>
  start(createIdleState(s), s, at, () => runId);

describe('timer storage', () => {
  it('returns defaults when nothing is stored, and persists changed settings', () => {
    const { storage } = setup();
    expect(storage.loadSettings()).toEqual(DEFAULT_TIMER_SETTINGS);
    storage.saveSettings({ focusMinutes: 50, breakMinutes: 10, rounds: 3 });
    expect(storage.loadSettings()).toEqual({ focusMinutes: 50, breakMinutes: 10, rounds: 3 });
  });

  it('saves completed focus sessions only', () => {
    const { repos, storage } = setup();
    const s = { ...DEFAULT_TIMER_SETTINGS, rounds: 2 };
    const running = begin(s, 0);

    // unfinished focus (paused / reset) is never recorded
    storage.recordCompletedFocus(advance(pause(running, 24 * MIN), 99 * MIN).completedFocus);
    storage.recordCompletedFocus(advance(reset(s), 99 * MIN).completedFocus);
    expect(repos.studySessions.listSince(0)).toEqual([]);

    storage.recordCompletedFocus(advance(running, 25 * MIN).completedFocus);
    expect(repos.studySessions.listSince(0)).toMatchObject([
      { id: 'run-1:1', folderId: null, startedAt: 0, endedAt: 25 * MIN, durationSeconds: 25 * 60 },
    ]);
  });

  it('stores the real startedAt and the focused duration separately when paused', () => {
    const { repos, storage } = setup();
    const running = begin(DEFAULT_TIMER_SETTINGS, 0);
    const resumed = resume(pause(running, 10 * MIN), 40 * MIN);
    storage.recordCompletedFocus(advance(resumed, 55 * MIN).completedFocus);
    expect(repos.studySessions.listSince(0)).toMatchObject([
      { startedAt: 0, endedAt: 55 * MIN, durationSeconds: 25 * 60 },
    ]);
  });

  it('is idempotent: completing the same session twice leaves one row', () => {
    const { repos, storage } = setup();
    const { completedFocus } = advance(begin(DEFAULT_TIMER_SETTINGS, 0), 25 * MIN);
    storage.recordCompletedFocus(completedFocus);
    storage.recordCompletedFocus(completedFocus);
    expect(repos.studySessions.listSince(0)).toHaveLength(1);
  });

  it('records separate completed sessions under separate ids', () => {
    const { repos, storage } = setup();
    storage.recordCompletedFocus(advance(begin(DEFAULT_TIMER_SETTINGS, 0, 'run-1'), 25 * MIN).completedFocus);
    storage.recordCompletedFocus(
      advance(begin(DEFAULT_TIMER_SETTINGS, 100 * MIN, 'run-2'), 125 * MIN).completedFocus,
    );
    const ids = repos.studySessions
      .listSince(0)
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual(['run-1:1', 'run-2:1']);
  });

  it('restores a running timer with the same sessionId and does not double-record after a crash', () => {
    const { repos, storage } = setup();
    const running = begin(DEFAULT_TIMER_SETTINGS, 0);
    storage.saveState(running);

    // Process 1 records the finished focus, then crashes before it could save the new state.
    storage.recordCompletedFocus(advance(running, 26 * MIN).completedFocus);

    // Process 2 restores the old state and catches up again.
    const restored = storage.loadState()!;
    expect(restored.sessionId).toBe(running.sessionId);
    expect(restored.focusStartedAt).toBe(0);
    const again = advance(restored, 27 * MIN);
    expect(again.completedFocus[0]?.sessionId).toBe('run-1:1');
    storage.recordCompletedFocus(again.completedFocus);
    expect(repos.studySessions.listSince(0)).toHaveLength(1);
    expect(again.state).toMatchObject({ phase: 'break', status: 'running' });
  });

  it('restores a paused timer with the same identity', () => {
    const { storage } = setup();
    const paused = pause(begin(DEFAULT_TIMER_SETTINGS, 0), 5 * MIN);
    storage.saveState(paused);
    expect(storage.loadState()).toEqual(paused);
  });

  it('ignores a corrupted or identity-less stored state (falls back to idle, nothing recorded)', () => {
    const { repos, storage } = setup();
    repos.settings.set('timer.state', '{oops');
    expect(storage.loadState()).toBeNull();

    const running = begin(DEFAULT_TIMER_SETTINGS, 0);
    repos.settings.set('timer.state', JSON.stringify({ ...running, sessionId: undefined }));
    expect(storage.loadState()).toBeNull();
    repos.settings.set('timer.state', JSON.stringify({ ...running, runId: undefined }));
    expect(storage.loadState()).toBeNull();
    expect(repos.studySessions.listSince(0)).toEqual([]);
  });
});
