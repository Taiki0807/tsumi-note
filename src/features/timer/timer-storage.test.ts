import { createRepositories } from '@/db/repositories';
import { createTestDeps } from '@/db/test-utils';

import { advance, createIdleState, DEFAULT_TIMER_SETTINGS, pause, reset, start } from './timer-logic';
import { createTimerStorage } from './timer-storage';

const MIN = 60_000;

function setup() {
  const repos = createRepositories(createTestDeps().deps);
  return { repos, storage: createTimerStorage(repos) };
}

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
    const running = start(createIdleState(s), s, 0);

    // unfinished focus (paused / reset) is never recorded
    storage.recordCompletedFocus(advance(pause(running, 24 * MIN), 99 * MIN).completedFocus);
    storage.recordCompletedFocus(advance(reset(s), 99 * MIN).completedFocus);
    expect(repos.studySessions.listSince(0)).toEqual([]);

    storage.recordCompletedFocus(advance(running, 25 * MIN).completedFocus);
    expect(repos.studySessions.listSince(0)).toMatchObject([
      { folderId: null, startedAt: 0, endedAt: 25 * MIN, durationSeconds: 25 * 60 },
    ]);
  });

  it('restores a running timer after relaunch and catches up with the wall clock', () => {
    const { storage } = setup();
    const running = start(createIdleState(DEFAULT_TIMER_SETTINGS), DEFAULT_TIMER_SETTINGS, 0);
    storage.saveState(running);
    const restored = storage.loadState();
    expect(restored).toEqual(running);
    expect(advance(restored!, 26 * MIN).state).toMatchObject({ phase: 'break', status: 'running' });
  });

  it('ignores a corrupted stored state', () => {
    const { repos, storage } = setup();
    repos.settings.set('timer.state', '{oops');
    expect(storage.loadState()).toBeNull();
  });
});
