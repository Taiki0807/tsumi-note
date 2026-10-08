import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { goals } from '@/db/schema';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import {
  buildMonthGrid,
  daysUntilExam,
  formatExamDate,
  legacyEpochToExamDay,
  makeExamDay,
  parseExamDay,
  resolveLegacyEpoch,
  type GoalInput,
} from '@/domain/goal';

import type { ReminderScheduler } from './reminder-notifications';
import {
  loadActiveGoal,
  loadReminder,
  restoreReminder,
  saveGoal,
  saveReminder,
  toggleActionPlanItem,
} from './settings-use-cases';

const input: GoalInput = {
  title: '日商簿記2級',
  examDay: '2026-12-05',
  objective: '',
  purpose: '',
  actionPlan: '',
};

function withTimezone<T>(tz: string, run: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

describe('exam day (calendar date)', () => {
  it('builds and validates real dates only', () => {
    expect(makeExamDay(2026, 12, 5)).toBe('2026-12-05');
    expect(makeExamDay(2026, 2, 29)).toBeNull();
    expect(makeExamDay(2028, 2, 29)).toBe('2028-02-29'); // leap year
    expect(makeExamDay(2100, 2, 29)).toBeNull(); // not a leap year
    expect(makeExamDay(2026, 13, 1)).toBeNull();
    expect(makeExamDay(2026, 4, 31)).toBeNull();
    expect(parseExamDay('2026-12-5')).toBeUndefined();
    expect(parseExamDay('2026-12-05')).toEqual({ year: 2026, month: 12, day: 5 });
  });

  it('counts days across month ends, year ends and leap days', () => {
    const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
    expect(daysUntilExam('2027-01-01', at(2026, 12, 31))).toBe(1);
    expect(daysUntilExam('2026-12-01', at(2026, 11, 30))).toBe(1);
    expect(daysUntilExam('2028-03-01', at(2028, 2, 28))).toBe(2);
    expect(daysUntilExam('2029-03-01', at(2029, 2, 28))).toBe(1);
    expect(daysUntilExam('2026-12-05', at(2026, 12, 5))).toBe(0);
    expect(daysUntilExam('2026-12-05', at(2026, 12, 6))).toBe(-1);
  });

  it('keeps the same day and label whatever the device timezone', () => {
    const { repos } = { repos: createRepositories(createTestDeps(createTestDatabase()).deps) };
    withTimezone('Asia/Tokyo', () => saveGoal(repos, input));
    for (const tz of ['Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
      withTimezone(tz, () => {
        const goal = loadActiveGoal(repos);
        expect(goal?.examDay).toBe('2026-12-05');
        expect(formatExamDate(goal?.examDay ?? '')).toBe('2026年12月5日');
      });
    }
  });

  it('counts down from the current local day', () => {
    withTimezone('America/Los_Angeles', () => {
      expect(daysUntilExam('2026-12-05', new Date(2026, 11, 4, 23, 0).getTime())).toBe(1);
    });
    withTimezone('Asia/Tokyo', () => {
      expect(daysUntilExam('2026-12-05', new Date(2026, 11, 4, 23, 0).getTime())).toBe(1);
    });
  });

  it('builds the month grid (Sunday first)', () => {
    const grid = buildMonthGrid(2026, 12); // 2026-12-01 is a Tuesday
    expect(grid[0]).toEqual([0, 0, 1, 2, 3, 4, 5]);
    expect(grid.flat().filter((d) => d > 0)).toHaveLength(31);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(
      buildMonthGrid(2028, 2)
        .flat()
        .filter((d) => d > 0),
    ).toHaveLength(29);
  });

  it('saves a picked day, edits it, and keeps the old one when not saved', () => {
    const { repos } = { repos: createRepositories(createTestDeps(createTestDatabase()).deps) };
    saveGoal(repos, input);
    expect(loadActiveGoal(repos)?.examDay).toBe('2026-12-05');
    // The cancelled picker never reaches saveGoal, so the stored day is unchanged.
    expect(loadActiveGoal(repos)?.examDay).toBe('2026-12-05');
    saveGoal(repos, { ...input, examDay: '2027-01-31' });
    expect(loadActiveGoal(repos)?.examDay).toBe('2027-01-31');
    saveGoal(repos, { ...input, examDay: null });
    expect(loadActiveGoal(repos)?.examDay).toBeNull();
    expect(() => saveGoal(repos, { ...input, examDay: '2026-02-30' })).toThrow();
  });
});

describe('legacy exam_date migration', () => {
  it('recovers the original day from the epoch itself, independent of the current timezone', () => {
    const jst = withTimezone('Asia/Tokyo', () => new Date(2026, 11, 5).getTime());
    const pst = withTimezone('America/Los_Angeles', () => new Date(2026, 11, 5).getTime());
    const ist = withTimezone('Asia/Kolkata', () => new Date(2026, 11, 5).getTime());
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
      withTimezone(tz, () => {
        expect(legacyEpochToExamDay(jst)).toBe('2026-12-05');
        expect(legacyEpochToExamDay(pst)).toBe('2026-12-05');
        expect(legacyEpochToExamDay(ist)).toBe('2026-12-05');
      });
    }
  });

  it('does not guess for values that are not a local midnight', () => {
    expect(legacyEpochToExamDay(Date.UTC(2026, 11, 5, 3, 7, 11))).toBeNull();
    expect(legacyEpochToExamDay(Number.NaN)).toBeNull();
  });

  it('reads old rows as days without rewriting or losing them', () => {
    const db = createTestDatabase();
    const { deps } = createTestDeps(db);
    const repos = createRepositories(deps);
    const epoch = withTimezone('Asia/Tokyo', () => new Date(2026, 10, 15).getTime());
    db.insert(goals)
      .values({ id: 'g1', createdAt: 1, updatedAt: 1, deletedAt: null, title: '旧', examDate: epoch })
      .run();

    const goal = loadActiveGoal(repos);
    expect(goal?.examDay).toBe('2026-11-15');
    expect(repos.exporter.snapshot().goals[0]?.examDate).toBe(epoch); // raw value untouched

    saveGoal(repos, { ...input, examDay: goal?.examDay ?? null });
    const stored = repos.exporter.snapshot().goals[0];
    expect(stored?.examDay).toBe('2026-11-15');
    expect(stored?.examDate).toBeNull();
  });

  describe('timezone boundaries', () => {
    const HOUR = 60 * 60 * 1000;
    // Local midnight of 2026-11-15 in a zone at `offsetHours` from UTC.
    const midnight = (offsetHours: number) => Date.UTC(2026, 10, 15) - offsetHours * HOUR;

    it('UTC+13 / UTC+14 / UTC-10 share remainders and are never guessed', () => {
      expect(resolveLegacyEpoch(midnight(14))).toEqual({
        kind: 'ambiguous',
        candidates: ['2026-11-15', '2026-11-14'],
      });
      expect(resolveLegacyEpoch(midnight(-10))).toEqual({
        kind: 'ambiguous',
        candidates: ['2026-11-16', '2026-11-15'],
      });
      expect(resolveLegacyEpoch(midnight(13)).kind).toBe('ambiguous'); // vs UTC-11
      expect(resolveLegacyEpoch(midnight(12)).kind).toBe('ambiguous'); // vs UTC-12
      expect(legacyEpochToExamDay(midnight(14))).toBeNull();
      expect(legacyEpochToExamDay(midnight(13))).toBeNull();
      expect(legacyEpochToExamDay(midnight(-10))).toBeNull();
    });

    it('recovers every unambiguous offset', () => {
      for (const o of [-9, -8, -5, 0, 1, 5.5, 5.75, 9, 10, 11]) {
        expect(legacyEpochToExamDay(midnight(o))).toBe('2026-11-15');
      }
    });

    it('treats values that are no local midnight at any real offset as unrecoverable', () => {
      expect(resolveLegacyEpoch(Date.UTC(2026, 10, 15, 3, 7))).toEqual({ kind: 'unrecoverable' });
      expect(resolveLegacyEpoch(Number.POSITIVE_INFINITY)).toEqual({ kind: 'unrecoverable' });
    });
  });

  describe('legacy values survive non-date edits', () => {
    const seed = (examDate: number) => {
      const db = createTestDatabase();
      const repos = createRepositories(createTestDeps(db).deps);
      db.insert(goals)
        .values({
          id: 'g1',
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
          title: '旧',
          actionPlan: '[ ] a\n[ ] b',
          examDate,
        })
        .run();
      return repos;
    };
    const ambiguous = Date.UTC(2026, 10, 15) - 14 * 60 * 60 * 1000; // UTC+14 or UTC-10
    const { examDay: _omit, ...withoutDay } = input;

    it('checking an action item keeps the unresolved legacy date', () => {
      const repos = seed(ambiguous);
      expect(loadActiveGoal(repos)?.examDay).toBeNull();
      toggleActionPlanItem(repos, 1);
      const row = repos.exporter.snapshot().goals[0];
      expect(row?.examDate).toBe(ambiguous);
      expect(row?.examDay).toBeNull();
      expect(row?.actionPlan).toBe('[ ] a\n[x] b');
    });

    it('editing the title keeps the legacy date and the checks', () => {
      const repos = seed(ambiguous);
      toggleActionPlanItem(repos, 0);
      saveGoal(repos, { ...withoutDay, title: '改名', actionPlan: 'a\nb' });
      const row = repos.exporter.snapshot().goals[0];
      expect(row?.title).toBe('改名');
      expect(row?.examDate).toBe(ambiguous);
      expect(row?.actionPlan).toBe('[x] a\n[ ] b');
    });

    it('a resolvable legacy date is not rewritten by non-date edits either', () => {
      const epoch = withTimezone('Asia/Tokyo', () => new Date(2026, 10, 15).getTime());
      const repos = seed(epoch);
      toggleActionPlanItem(repos, 0);
      const row = repos.exporter.snapshot().goals[0];
      expect(row?.examDate).toBe(epoch);
      expect(loadActiveGoal(repos)?.examDay).toBe('2026-11-15');
    });

    it('re-picking in the calendar stores examDay and retires the legacy epoch; it survives a reload', () => {
      const repos = seed(ambiguous);
      saveGoal(repos, { ...input, examDay: '2026-11-15' });
      const row = repos.exporter.snapshot().goals[0];
      expect(row?.examDay).toBe('2026-11-15');
      expect(row?.examDate).toBeNull();
      expect(loadActiveGoal(repos)?.examDay).toBe('2026-11-15');
    });

    it('explicitly clearing the date (null) is different from not touching it', () => {
      const repos = seed(ambiguous);
      saveGoal(repos, { ...input, examDay: null });
      const row = repos.exporter.snapshot().goals[0];
      expect(row?.examDay).toBeNull();
      expect(row?.examDate).toBeNull();
    });

    it('persists across an app restart (file database)', () => {
      const dir = mkdtempSync(path.join(tmpdir(),'goal-restart-'));
      const file = path.join(dir, 'test.db');
      try {
        const first = createTestDatabase(file);
        createRepositories(createTestDeps(first).deps);
        first
          .insert(goals)
          .values({ id: 'g1', createdAt: 1, updatedAt: 1, deletedAt: null, title: '旧', examDate: ambiguous })
          .run();
        toggleActionPlanItem(createRepositories(createTestDeps(first).deps), 0);
        const second = createRepositories(createTestDeps(createTestDatabase(file)).deps);
        expect(second.exporter.snapshot().goals[0]?.examDate).toBe(ambiguous);
        saveGoal(second, { ...input, examDay: '2027-01-31' });
        const third = createRepositories(createTestDeps(createTestDatabase(file)).deps);
        expect(loadActiveGoal(third)?.examDay).toBe('2027-01-31');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('keeps an unconvertible legacy value in the database and shows no date', () => {
    const db = createTestDatabase();
    const repos = createRepositories(createTestDeps(db).deps);
    db.insert(goals)
      .values({ id: 'g1', createdAt: 1, updatedAt: 1, deletedAt: null, title: '旧', examDate: 1234567 })
      .run();
    expect(loadActiveGoal(repos)?.examDay).toBeNull();
    expect(repos.exporter.snapshot().goals[0]?.examDate).toBe(1234567);
  });
});

function scheduler(opts: { permission?: boolean; failSchedule?: boolean; failCancel?: boolean } = {}) {
  const calls: string[] = [];
  const s: ReminderScheduler = {
    ensurePermission: async () => opts.permission ?? true,
    schedule: async (h, m) => {
      if (opts.failSchedule) throw new Error('schedule');
      calls.push(`schedule ${h}:${m}`);
    },
    cancel: async () => {
      if (opts.failCancel) throw new Error('cancel');
      calls.push('cancel');
    },
  };
  return { s, calls };
}

const on = { enabled: true, hour: 21, minute: 0 };

describe('reminder consistency with the OS', () => {
  const repos = () => createRepositories(createTestDeps(createTestDatabase()).deps);

  it('ON → OFF cancels and stores off', async () => {
    const r = repos();
    const fake = scheduler();
    await saveReminder(r, fake.s, on);
    const result = await saveReminder(r, fake.s, { ...on, enabled: false });
    expect(result.ok).toBe(true);
    expect(loadReminder(r).enabled).toBe(false);
    expect(fake.calls).toEqual(['schedule 21:0', 'cancel']);
  });

  it('a failed cancel keeps the reminder ON and reports the error', async () => {
    const r = repos();
    await saveReminder(r, scheduler().s, on);
    const result = await saveReminder(r, scheduler({ failCancel: true }).s, { ...on, enabled: false });
    expect(result).toEqual({ ok: false, reason: 'cancel-failed', reminder: on });
    expect(loadReminder(r)).toEqual(on);
  });

  it('a failed schedule leaves the previous settings and never stores ON', async () => {
    const r = repos();
    const result = await saveReminder(r, scheduler({ failSchedule: true }).s, on);
    expect(result).toEqual({
      ok: false,
      reason: 'schedule-failed',
      reminder: { enabled: false, hour: 21, minute: 0 },
    });
    expect(loadReminder(r).enabled).toBe(false);

    await saveReminder(r, scheduler().s, on);
    const failed = await saveReminder(r, scheduler({ failSchedule: true }).s, { ...on, hour: 7 });
    expect(failed.ok).toBe(false);
    expect(loadReminder(r)).toEqual(on); // old time still in effect on the OS
  });

  it('changing the time re-schedules under the same reminder', async () => {
    const r = repos();
    const fake = scheduler();
    await saveReminder(r, fake.s, on);
    await saveReminder(r, fake.s, { ...on, hour: 6, minute: 30 });
    expect(fake.calls).toEqual(['schedule 21:0', 'schedule 6:30']);
    expect(loadReminder(r)).toEqual({ enabled: true, hour: 6, minute: 30 });
  });

  it('permission denied stores off and cancels any stale schedule', async () => {
    const r = repos();
    const fake = scheduler({ permission: false });
    const result = await saveReminder(r, fake.s, on);
    expect(result.ok).toBe(false);
    expect(loadReminder(r).enabled).toBe(false);
    expect(fake.calls).toEqual(['cancel']);
  });

  it('relaunch re-syncs: a disabled reminder is cancelled again, an enabled one re-registered', async () => {
    const r = repos();
    await saveReminder(r, scheduler().s, on);
    // The cancel fails, so the stored state stays ON.
    await saveReminder(r, scheduler({ failCancel: true }).s, { ...on, enabled: false });
    const relaunch = scheduler();
    await restoreReminder(r, relaunch.s);
    expect(relaunch.calls).toEqual(['schedule 21:0']);

    await saveReminder(r, scheduler().s, { ...on, enabled: false });
    const again = scheduler();
    await restoreReminder(r, again.s);
    expect(again.calls).toEqual(['cancel']);
  });

  it('revoked permission at launch keeps the user intent and cancels the stale schedule', async () => {
    const r = repos();
    await saveReminder(r, scheduler().s, on);
    const denied = scheduler({ permission: false });
    expect(await restoreReminder(r, denied.s)).toBe('permission-denied');
    expect(loadReminder(r)).toEqual(on); // intent untouched
    expect(denied.calls).toEqual(['cancel']);
  });

  it('a failed cancel while permission is denied is reported as sync-failed, never as cancelled', async () => {
    const r = repos();
    await saveReminder(r, scheduler().s, on);
    expect(await restoreReminder(r, scheduler({ permission: false, failCancel: true }).s)).toBe(
      'sync-failed',
    );
    expect(loadReminder(r)).toEqual(on);
  });

  it('denied on enable with a failed cancel keeps the previous state', async () => {
    const r = repos();
    await saveReminder(r, scheduler().s, { ...on, hour: 7 });
    const result = await saveReminder(r, scheduler({ permission: false, failCancel: true }).s, on);
    expect(result).toEqual({ ok: false, reason: 'cancel-failed', reminder: { ...on, hour: 7 } });
    expect(loadReminder(r)).toEqual({ ...on, hour: 7 });
  });

  it('re-syncs a mismatch: OS schedule left behind while stored OFF, then permission recovery', async () => {
    const r = repos();
    // Stored OFF, but the OS still holds a schedule (earlier crash between the OS call and the write).
    const os = scheduler();
    expect(await restoreReminder(r, os.s)).toBe('synced');
    expect(os.calls).toEqual(['cancel']);

    // The user wants ON; permission is then revoked: intent stays, nothing stays scheduled.
    await saveReminder(r, scheduler().s, on);
    expect(await restoreReminder(r, scheduler({ permission: false }).s)).toBe('permission-denied');
    // Permission comes back: the next sync schedules it again without any user action.
    const back = scheduler();
    expect(await restoreReminder(r, back.s)).toBe('synced');
    expect(back.calls).toEqual(['schedule 21:0']);
  });

  it('a failed schedule at launch reports sync-failed and keeps the stored intent', async () => {
    const r = repos();
    await saveReminder(r, scheduler().s, on);
    expect(await restoreReminder(r, scheduler({ failSchedule: true }).s)).toBe('sync-failed');
    expect(loadReminder(r)).toEqual(on);
  });

  it('only touches the reminder scheduler, never the timer notifications', () => {
    // The scheduler contract has no "cancel all"; the real one cancels only REMINDER_NOTIFICATION_ID.
    expect(Object.keys(scheduler().s).sort()).toEqual(['cancel', 'ensurePermission', 'schedule']);
  });
});
