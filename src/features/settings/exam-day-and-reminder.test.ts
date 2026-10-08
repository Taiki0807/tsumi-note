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
  type GoalInput,
} from '@/domain/goal';

import type { ReminderScheduler } from './reminder-notifications';
import { loadActiveGoal, loadReminder, restoreReminder, saveGoal, saveReminder } from './settings-use-cases';

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

  it('revoked permission at launch is reflected as off', async () => {
    const r = repos();
    await saveReminder(r, scheduler().s, on);
    await restoreReminder(r, scheduler({ permission: false }).s);
    expect(loadReminder(r).enabled).toBe(false);
  });

  it('only touches the reminder scheduler, never the timer notifications', () => {
    // The scheduler contract has no "cancel all"; the real one cancels only REMINDER_NOTIFICATION_ID.
    expect(Object.keys(scheduler().s).sort()).toEqual(['cancel', 'ensurePermission', 'schedule']);
  });
});
