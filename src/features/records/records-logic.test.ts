// The time zone is pinned to Asia/Tokyo by jest.global-setup.js.
import { createRepositories } from '@/db/repositories';
import { createTestDeps } from '@/db/test-utils';
import {
  advance,
  createIdleState,
  DEFAULT_TIMER_SETTINGS,
  pause,
  reset,
  start,
} from '@/features/timer/timer-logic';
import { createTimerStorage } from '@/features/timer/timer-storage';

import { loadWeeklyRecord } from './load-weekly-record';
import {
  addWeeks,
  buildWeeklyRecord,
  chartMaxHours,
  formatDiff,
  formatWeekRange,
  splitDuration,
  startOfWeek,
  type SessionLike,
} from './records-logic';

const MIN = 60_000;
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const session = (startedAt: number, minutes: number, folderId: string | null = null): SessionLike => ({
  folderId,
  startedAt,
  durationSeconds: minutes * 60,
});

// 2026-09-07 is a Monday.
const WEEK = local(2026, 9, 7);

describe('week boundaries (local time, Monday start)', () => {
  it('maps every weekday to its Monday', () => {
    expect(startOfWeek(local(2026, 9, 7, 0, 0))).toBe(WEEK);
    expect(startOfWeek(local(2026, 9, 9, 15))).toBe(WEEK);
    expect(startOfWeek(local(2026, 9, 13, 23, 59))).toBe(WEEK);
    expect(startOfWeek(local(2026, 9, 14, 0, 0))).toBe(local(2026, 9, 14));
  });

  it('uses the local date, not the UTC date', () => {
    // 2026-09-06T15:30Z is Monday 00:30 in Tokyo (UTC date is still Sunday 9/6).
    expect(startOfWeek(Date.UTC(2026, 8, 6, 15, 30))).toBe(WEEK);
    // 2026-09-13T14:59Z is Sunday 23:59 in Tokyo: still the same week.
    expect(startOfWeek(Date.UTC(2026, 8, 13, 14, 59))).toBe(WEEK);
  });

  it('handles weeks that span a month and a year', () => {
    expect(formatWeekRange(local(2026, 8, 31))).toBe('8/31（月） – 9/6（日）');
    expect(formatWeekRange(local(2025, 12, 29))).toBe('12/29（月） – 1/4（日）');
    expect(startOfWeek(local(2026, 1, 2))).toBe(local(2025, 12, 29));
    expect(addWeeks(local(2025, 12, 29), 1)).toBe(local(2026, 1, 5));
    expect(addWeeks(local(2026, 3, 2), -1)).toBe(local(2026, 2, 23));
  });
});

describe('buildWeeklyRecord', () => {
  it('handles zero sessions', () => {
    const r = buildWeeklyRecord([], WEEK);
    expect(r.totalSeconds).toBe(0);
    expect(r.diffSeconds).toBe(0);
    expect(r.sessionCount).toBe(0);
    expect(r.days).toHaveLength(7);
    expect(r.days.every((d) => d.seconds === 0)).toBe(true);
  });

  it('handles one session', () => {
    const r = buildWeeklyRecord([session(local(2026, 9, 9, 10), 25)], WEEK);
    expect(r.totalSeconds).toBe(25 * 60);
    expect(r.days[2]?.seconds).toBe(25 * 60);
    expect(r.sessionCount).toBe(1);
  });

  it('sums several sessions on the same day and across days', () => {
    const r = buildWeeklyRecord(
      [
        session(local(2026, 9, 7, 9), 25),
        session(local(2026, 9, 7, 21), 25),
        session(local(2026, 9, 10, 8), 50),
        session(local(2026, 9, 13, 23, 59), 10),
      ],
      WEEK,
    );
    expect(r.days.map((d) => d.seconds / 60)).toEqual([50, 0, 0, 50, 0, 0, 10]);
    expect(r.totalSeconds).toBe(110 * 60);
    expect(r.sessionCount).toBe(4);
  });

  it('assigns days by local midnight', () => {
    const r = buildWeeklyRecord(
      [
        session(local(2026, 9, 7, 0, 0), 1), // Monday 00:00 (first instant)
        session(local(2026, 9, 6, 23, 59), 7), // previous Sunday
        session(local(2026, 9, 14, 0, 0), 9), // next Monday
        session(Date.UTC(2026, 8, 7, 14, 59), 3), // Mon 23:59 JST (UTC date is also 9/7)
        session(Date.UTC(2026, 8, 7, 15, 0), 5), // Tue 00:00 JST (UTC date is still 9/7)
      ],
      WEEK,
    );
    expect(r.days[0]?.seconds).toBe((1 + 3) * 60);
    expect(r.days[1]?.seconds).toBe(5 * 60);
    expect(r.totalSeconds / 60).toBe(9);
    expect(r.previousTotalSeconds / 60).toBe(7);
  });

  it('counts a session that runs past midnight on its start day', () => {
    const r = buildWeeklyRecord([session(local(2026, 9, 9, 23, 50), 25)], WEEK);
    expect(r.days[2]?.seconds).toBe(25 * 60);
    expect(r.days[3]?.seconds).toBe(0);
  });

  it('works across a year boundary', () => {
    const week = local(2025, 12, 29);
    const r = buildWeeklyRecord(
      [
        session(local(2025, 12, 31, 23, 0), 20),
        session(local(2026, 1, 1, 0, 30), 30),
        session(local(2025, 12, 25, 9), 15),
      ],
      week,
    );
    expect(r.days[2]?.seconds).toBe(20 * 60);
    expect(r.days[3]?.seconds).toBe(30 * 60);
    expect(r.totalSeconds / 60).toBe(50);
    expect(r.previousTotalSeconds / 60).toBe(15);
  });

  it('compares with the previous week', () => {
    const r = buildWeeklyRecord(
      [session(local(2026, 9, 8, 9), 100), session(local(2026, 9, 1, 9), 55)],
      WEEK,
    );
    expect(r.previousTotalSeconds / 60).toBe(55);
    expect(r.diffSeconds / 60).toBe(45);
    expect(formatDiff(r.diffSeconds)).toEqual({ kind: 'up', label: '+45分 前週比' });
  });

  it('filters by folder (the previous week too)', () => {
    const sessions = [
      session(local(2026, 9, 8, 9), 30, 'a'),
      session(local(2026, 9, 8, 10), 20, 'b'),
      session(local(2026, 9, 1, 9), 10, 'a'),
      session(local(2026, 9, 1, 9), 99, 'b'),
    ];
    const r = buildWeeklyRecord(sessions, WEEK, 'a');
    expect(r.totalSeconds / 60).toBe(30);
    expect(r.previousTotalSeconds / 60).toBe(10);
    expect(buildWeeklyRecord(sessions, WEEK).totalSeconds / 60).toBe(50);
  });
});

describe('formatting', () => {
  it('formats the diff chip', () => {
    expect(formatDiff(-30 * 60)).toEqual({ kind: 'down', label: '-30分 前週比' });
    expect(formatDiff(65 * 60)).toEqual({ kind: 'up', label: '+1時間5分 前週比' });
    expect(formatDiff(60 * 60)).toEqual({ kind: 'up', label: '+1時間 前週比' });
    expect(formatDiff(10)).toEqual({ kind: 'same', label: '前週と同じ' });
  });

  it('splits durations into hours and minutes', () => {
    expect(splitDuration(325 * 60 + 59)).toEqual({ hours: 5, minutes: 25 });
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 });
  });

  it('keeps the chart axis on even whole hours, at least 2h', () => {
    const days = (hours: number) => [{ dayStart: 0, weekdayIndex: 0, seconds: hours * 3600 }];
    expect(chartMaxHours(days(0))).toBe(2);
    expect(chartMaxHours(days(1.25))).toBe(2);
    expect(chartMaxHours(days(2.5))).toBe(4);
    expect(chartMaxHours(days(5))).toBe(6);
  });
});

describe('records from SQLite (Phase 2 → Phase 3)', () => {
  function setup() {
    const repos = createRepositories(createTestDeps().deps);
    return { repos, storage: createTimerStorage(repos) };
  }

  it('shows an empty week for an empty database', () => {
    const { repos } = setup();
    const { record, folders } = loadWeeklyRecord(repos, WEEK);
    expect(record.totalSeconds).toBe(0);
    expect(folders).toEqual([]);
  });

  it('aggregates exactly what the timer stored, and ignores paused / reset sessions', () => {
    const { repos, storage } = setup();
    const s = { ...DEFAULT_TIMER_SETTINGS, rounds: 2 };
    const t0 = local(2026, 9, 8, 9);

    // Round 1 completes, round 2 is paused and then reset: only round 1 is stored.
    const running = start(createIdleState(s), s, t0, () => 'run-1');
    storage.recordCompletedFocus(advance(running, t0 + 25 * MIN).completedFocus);
    const second = advance(running, t0 + 30 * MIN).state;
    storage.recordCompletedFocus(advance(pause(second, t0 + 40 * MIN), t0 + 99 * MIN).completedFocus);
    expect(reset(s).status).toBe('idle');

    const stored = repos.studySessions.listSince(0);
    expect(stored).toHaveLength(1);

    const { record } = loadWeeklyRecord(repos, WEEK);
    expect(record.totalSeconds).toBe(stored.reduce((sum, r) => sum + r.durationSeconds, 0));
    expect(record.totalSeconds).toBe(25 * 60);
    expect(record.days[1]?.seconds).toBe(25 * 60);
  });

  it('only reads the selected and previous week, and matches the stored rows', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: '韓国語' });
    const rec = (startedAt: number, minutes: number, folderId: string | null) =>
      repos.studySessions.record({ folderId, startedAt, endedAt: startedAt + minutes * MIN });
    rec(local(2026, 9, 8, 9), 25, folder.id);
    rec(local(2026, 9, 8, 12), 25, null);
    rec(local(2026, 9, 2, 9), 40, folder.id);
    rec(local(2026, 8, 20, 9), 500, null); // two weeks back: outside the comparison window
    rec(local(2026, 9, 14, 0, 0), 500, null); // next week

    const all = loadWeeklyRecord(repos, WEEK);
    expect(all.record.totalSeconds / 60).toBe(50);
    expect(all.record.previousTotalSeconds / 60).toBe(40);
    expect(all.folders).toEqual([{ id: folder.id, name: '韓国語' }]);

    const only = loadWeeklyRecord(repos, WEEK, folder.id);
    expect(only.record.totalSeconds / 60).toBe(25);
    expect(only.record.diffSeconds / 60).toBe(-15);

    expect(repos.studySessions.listBetween(WEEK, addWeeks(WEEK, 1))).toHaveLength(2);
  });
});
