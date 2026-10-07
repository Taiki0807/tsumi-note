import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import { loadWeeklyRecord } from '@/features/records/load-weekly-record';
import { startOfWeek } from '@/features/records/records-logic';

import {
  advance,
  createIdleState,
  DEFAULT_TIMER_SETTINGS,
  parseStoredState,
  pause,
  reset,
  start,
} from './timer-logic';
import { createTimerStorage } from './timer-storage';

const MIN = 60_000;
const S = { ...DEFAULT_TIMER_SETTINGS, rounds: 2 };

function setup(file?: string) {
  const repos = createRepositories(createTestDeps(createTestDatabase(file)).deps);
  return { repos, storage: createTimerStorage(repos) };
}
const begin = (runId: string, at: number, folderId: string | null) =>
  start(createIdleState(S), S, at, () => runId, folderId);

describe('timer ↔ folders', () => {
  it('lists live folders from SQLite, reflects new ones, and hides deleted ones', () => {
    const { repos, storage } = setup();
    expect(storage.listFolders()).toEqual([]);
    const a = repos.folders.create({ name: '韓国語' });
    const b = repos.folders.create({ name: '簿記2級' });
    expect(storage.listFolders().map((f) => f.name)).toEqual(['韓国語', '簿記2級']);
    repos.folders.softDelete(a.id);
    expect(storage.listFolders().map((f) => f.id)).toEqual([b.id]);
  });

  it('persists the picker value; a deleted or unknown folder falls back to 未分類', () => {
    const { repos, storage } = setup();
    const a = repos.folders.create({ name: 'A' });
    expect(storage.loadSelectedFolderId()).toBeNull();
    storage.saveSelectedFolderId(a.id);
    expect(storage.loadSelectedFolderId()).toBe(a.id);
    repos.folders.softDelete(a.id);
    expect(storage.loadSelectedFolderId()).toBeNull();
    storage.saveSelectedFolderId(null);
    expect(storage.loadSelectedFolderId()).toBeNull();
  });

  it('saves the folder chosen at start on completion, per session', () => {
    const { repos, storage } = setup();
    const a = repos.folders.create({ name: 'A' });
    const b = repos.folders.create({ name: 'B' });
    storage.recordCompletedFocus(advance(begin('r1', 0, a.id), 25 * MIN).completedFocus);
    storage.recordCompletedFocus(advance(begin('r2', 100 * MIN, b.id), 125 * MIN).completedFocus);
    storage.recordCompletedFocus(advance(begin('r3', 200 * MIN, null), 225 * MIN).completedFocus);
    const byId = Object.fromEntries(repos.studySessions.listSince(0).map((s) => [s.id, s.folderId]));
    expect(byId).toEqual({ 'r1:1': a.id, 'r2:1': b.id, 'r3:1': null });
  });

  it('keeps the folder of a running run even if the picker changes afterwards', () => {
    const { repos, storage } = setup();
    const a = repos.folders.create({ name: 'A' });
    const b = repos.folders.create({ name: 'B' });
    storage.saveSelectedFolderId(a.id);
    const running = begin('r1', 0, storage.loadSelectedFolderId());
    storage.saveSelectedFolderId(b.id); // next run only
    // The state survives a relaunch with its folder.
    const restored = parseStoredState(JSON.stringify(running))!;
    expect(restored.folderId).toBe(a.id);
    // Both rounds of the run belong to A.
    storage.recordCompletedFocus(advance(restored, 25 * MIN + 5 * MIN + 25 * MIN).completedFocus);
    expect(repos.studySessions.listSince(0).map((s) => s.folderId)).toEqual([a.id, a.id]);
  });

  it('does not save on reset or while unfinished, and stays idempotent', () => {
    const { repos, storage } = setup();
    const a = repos.folders.create({ name: 'A' });
    const running = begin('r1', 0, a.id);
    storage.recordCompletedFocus(advance(pause(running, 10 * MIN), 99 * MIN).completedFocus);
    storage.recordCompletedFocus(advance(reset(S), 99 * MIN).completedFocus);
    expect(repos.studySessions.listSince(0)).toEqual([]);

    const { completedFocus } = advance(running, 25 * MIN);
    storage.recordCompletedFocus(completedFocus);
    storage.recordCompletedFocus(completedFocus);
    expect(repos.studySessions.listSince(0)).toHaveLength(1);
  });

  it('treats a stored state from before the folder link as 未分類', () => {
    const legacy = JSON.parse(JSON.stringify(createIdleState(S)));
    delete legacy.folderId;
    expect(parseStoredState(JSON.stringify(legacy))?.folderId).toBeNull();
  });

  it('keeps past sessions after the folder is deleted and feeds the weekly folder filter', () => {
    const { repos, storage } = setup();
    const a = repos.folders.create({ name: 'A' });
    const b = repos.folders.create({ name: 'B' });
    storage.recordCompletedFocus(
      advance(begin('r1', 1_800_000_000_000, a.id), 1_800_000_000_000 + 25 * MIN).completedFocus,
    );
    storage.recordCompletedFocus(
      advance(begin('r2', 1_800_000_000_000, b.id), 1_800_000_000_000 + 25 * MIN).completedFocus,
    );
    const week = startOfWeek(1_800_000_000_000);

    expect(loadWeeklyRecord(repos, week, a.id).record.totalSeconds).toBe(25 * 60);
    expect(loadWeeklyRecord(repos, week).record.totalSeconds).toBe(50 * 60);
    repos.folders.softDelete(a.id);
    expect(repos.studySessions.listSince(0)).toHaveLength(2);
    expect(loadWeeklyRecord(repos, week).record.totalSeconds).toBe(50 * 60);
  });

  it('keeps the folder id after an app restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tsumi-note-timer-folder-'));
    try {
      const file = path.join(dir, 'app.db');
      const first = setup(file);
      const a = first.repos.folders.create({ name: 'A' });
      first.storage.recordCompletedFocus(advance(begin('r1', 0, a.id), 25 * MIN).completedFocus);
      expect(setup(file).repos.studySessions.listSince(0)[0]?.folderId).toBe(a.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
