import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import {
  describeReminder,
  parseReminderTime,
  DEFAULT_REMINDER,
  type ReminderSettings,
} from '@/domain/app-settings';
import {
  applyPlanEdit,
  daysUntilExam,
  formatExamDate,
  parseActionPlan,
  parsePlanItems,
  planEditText,
  validateGoal,
  type GoalInput,
} from '@/domain/goal';
import { DEFAULT_REVIEW_SETTINGS } from '@/domain/review-settings';
import { saveReviewSettings } from '@/features/review/review-use-cases';
import { clampSettings, createIdleState, DEFAULT_TIMER_SETTINGS, start } from '@/features/timer/timer-logic';
import { createTimerStorage } from '@/features/timer/timer-storage';

import { buildExportJson } from './export-data';
import type { ReminderScheduler } from './reminder-notifications';
import {
  deleteGoal,
  describeTimerSettings,
  loadActiveGoal,
  loadDarkMode,
  loadMyPageSummary,
  loadReminder,
  loadTimerSettings,
  restoreReminder,
  saveDarkMode,
  saveGoal,
  saveReminder,
  saveTimerSettings,
  toggleActionPlanItem,
} from './settings-use-cases';

function setup(file?: string) {
  const { deps, tick } = createTestDeps(createTestDatabase(file));
  return { repos: createRepositories(deps), tick };
}

const goalInput: GoalInput = {
  title: ' 日商簿記2級 ',
  examDay: '2026-11-15',
  objective: '試験に合格する',
  purpose: '業務を理解する',
  actionPlan: '平日30分、問題を解く\n\n 週末に復習 ',
};

function fakeScheduler(permission = true) {
  const scheduled: [number, number][] = [];
  let cancelled = 0;
  const scheduler: ReminderScheduler = {
    ensurePermission: async () => permission,
    schedule: async (h, m) => {
      scheduled.push([h, m]);
    },
    cancel: async () => {
      cancelled++;
    },
  };
  return { scheduler, scheduled, cancelled: () => cancelled };
}

describe('goal domain', () => {
  it('validates title, limits and plan items', () => {
    expect(validateGoal({ ...goalInput })).toBe(true);
    expect(validateGoal({ ...goalInput, title: '   ' })).toBe(false);
    expect(validateGoal({ ...goalInput, title: 'a'.repeat(61) })).toBe(false);
    expect(validateGoal({ ...goalInput, examDay: null })).toBe(true);
    expect(validateGoal({ ...goalInput, examDay: '2026-02-30' })).toBe(false);
  });

  it('parses plan lines and formats exam days', () => {
    expect(parseActionPlan('a\n\n b \n')).toEqual(['a', 'b']);
    expect(formatExamDate('2026-11-15')).toBe('2026年11月15日');
    expect(formatExamDate('2026-12-05')).toBe('2026年12月5日');
  });

  it('counts calendar days (Figma: あと52日 from 2026-09-24 to 2026-11-15)', () => {
    const exam = '2026-11-15';
    expect(daysUntilExam(exam, new Date(2026, 8, 24, 23, 59).getTime())).toBe(52);
    expect(daysUntilExam(exam, new Date(2026, 10, 15, 0, 0).getTime())).toBe(0);
    expect(daysUntilExam(exam, new Date(2026, 10, 16).getTime())).toBe(-1);
    expect(daysUntilExam(null, 0)).toBeNull();
  });
});

describe('action plan checklist', () => {
  it('toggles one item, persists it and leaves the others alone', () => {
    const { repos, tick } = setup();
    saveGoal(repos, { ...goalInput, actionPlan: 'a\nb\nc' });
    tick();
    const toggled = toggleActionPlanItem(repos, 1);
    expect(parsePlanItems(toggled?.actionPlan ?? '')).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: true },
      { text: 'c', done: false },
    ]);
    expect(toggled?.updatedAt).toBeGreaterThan(0);
    // Read back from SQLite, not from the returned object.
    expect(parsePlanItems(loadActiveGoal(repos)?.actionPlan ?? '').map((i) => i.done)).toEqual([
      false,
      true,
      false,
    ]);
    // And back to unchecked.
    toggleActionPlanItem(repos, 1);
    expect(parsePlanItems(loadActiveGoal(repos)?.actionPlan ?? '').every((i) => !i.done)).toBe(true);
  });

  it('ignores out-of-range indexes and works without a goal', () => {
    const { repos } = setup();
    expect(toggleActionPlanItem(repos, 0)).toBeUndefined();
    saveGoal(repos, { ...goalInput, actionPlan: 'a' });
    toggleActionPlanItem(repos, 5);
    expect(parsePlanItems(loadActiveGoal(repos)?.actionPlan ?? '')).toEqual([{ text: 'a', done: false }]);
  });

  it('keeps check states through an edit when the item text is unchanged', () => {
    const { repos } = setup();
    saveGoal(repos, { ...goalInput, actionPlan: 'a\nb\nc' });
    toggleActionPlanItem(repos, 0);
    toggleActionPlanItem(repos, 2);
    // The edit form shows plain lines (no markers) …
    expect(planEditText(loadActiveGoal(repos)?.actionPlan ?? '')).toBe('a\nb\nc');
    // … reword b, drop nothing, add d: a / c stay checked, b (reworded) and d start unchecked.
    saveGoal(repos, { ...goalInput, actionPlan: 'a\nb2\nc\nd' });
    expect(parsePlanItems(loadActiveGoal(repos)?.actionPlan ?? '')).toEqual([
      { text: 'a', done: true },
      { text: 'b2', done: false },
      { text: 'c', done: true },
      { text: 'd', done: false },
    ]);
    // Editing another section (title) re-submits the same plain plan and changes no state.
    saveGoal(repos, { ...goalInput, title: '別の資格', actionPlan: 'a\nb2\nc\nd' });
    expect(parsePlanItems(loadActiveGoal(repos)?.actionPlan ?? '').map((i) => i.done)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('treats legacy lines without a marker as unchecked and matches duplicates in order', () => {
    expect(parsePlanItems('x\n[x] y')).toEqual([
      { text: 'x', done: false },
      { text: 'y', done: true },
    ]);
    expect(applyPlanEdit('[x] same\n[ ] same', 'same\nsame\nsame')).toBe('[x] same\n[ ] same\n[ ] same');
  });

  it('restores the check state after an app restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-'));
    const file = path.join(dir, 'test.db');
    try {
      const first = setup(file).repos;
      saveGoal(first, { ...goalInput, actionPlan: 'a\nb' });
      toggleActionPlanItem(first, 1);
      expect(parsePlanItems(loadActiveGoal(setup(file).repos)?.actionPlan ?? '')).toEqual([
        { text: 'a', done: false },
        { text: 'b', done: true },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('timer settings from マイページ', () => {
  it('reads and writes the timer storage, clamped, and the summary follows', () => {
    const { repos } = setup();
    expect(loadTimerSettings(repos)).toEqual(DEFAULT_TIMER_SETTINGS);
    const saved = saveTimerSettings(repos, { focusMinutes: 50, breakMinutes: 10, rounds: 3 });
    expect(saved).toEqual({ focusMinutes: 50, breakMinutes: 10, rounds: 3 });
    // The timer tab's own storage sees exactly the same values.
    expect(createTimerStorage(repos).loadSettings()).toEqual(saved);
    expect(loadMyPageSummary(repos, Date.now()).timerSummary).toBe('集中50分・休憩10分');
    expect(describeTimerSettings(saved)).toBe('集中50分・休憩10分');
    expect(saveTimerSettings(repos, { focusMinutes: 9999, breakMinutes: 0, rounds: 999 })).toEqual(
      clampSettings({ focusMinutes: 9999, breakMinutes: 0, rounds: 999 }),
    );
  });

  it('does not touch a running timer session snapshot', () => {
    const { repos } = setup();
    const storage = createTimerStorage(repos);
    const running = start(
      createIdleState(DEFAULT_TIMER_SETTINGS),
      DEFAULT_TIMER_SETTINGS,
      1_000,
      () => 'session-1',
      null,
    );
    storage.saveState(running);
    saveTimerSettings(repos, { focusMinutes: 60, breakMinutes: 15, rounds: 2 });
    expect(storage.loadState()?.settings).toEqual(DEFAULT_TIMER_SETTINGS);
    expect(storage.loadSettings().focusMinutes).toBe(60);
  });
});

describe('goal use cases', () => {
  it('has no goal at first', () => {
    const { repos } = setup();
    expect(loadActiveGoal(repos)).toBeUndefined();
    expect(loadMyPageSummary(repos, Date.now()).goal).toBeNull();
  });

  it('creates with normalized values, then edits the same single goal', () => {
    const { repos, tick } = setup();
    const created = saveGoal(repos, goalInput);
    expect(created.title).toBe('日商簿記2級');
    expect(created.actionPlan).toBe('[ ] 平日30分、問題を解く\n[ ] 週末に復習');

    tick();
    const edited = saveGoal(repos, { ...goalInput, title: '日商簿記1級' });
    expect(edited.id).toBe(created.id);
    expect(edited.updatedAt).toBeGreaterThan(created.updatedAt);
    expect(loadActiveGoal(repos)?.title).toBe('日商簿記1級');
    expect(repos.exporter.snapshot().goals).toHaveLength(1);
  });

  it('rejects invalid input without storing anything', () => {
    const { repos } = setup();
    expect(() => saveGoal(repos, { ...goalInput, title: '' })).toThrow();
    expect(loadActiveGoal(repos)).toBeUndefined();
  });

  it('delete is a tombstone and a new goal can be created afterwards', () => {
    const { repos, tick } = setup();
    saveGoal(repos, goalInput);
    tick();
    deleteGoal(repos);
    expect(loadActiveGoal(repos)).toBeUndefined();
    expect(repos.exporter.snapshot().goals[0]?.deletedAt).toEqual(expect.any(Number));

    saveGoal(repos, { ...goalInput, title: '基本情報' });
    expect(loadActiveGoal(repos)?.title).toBe('基本情報');
    expect(repos.exporter.snapshot().goals.filter((g) => g.deletedAt === null)).toHaveLength(1);
  });

  it('survives an app restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'goal-'));
    const file = path.join(dir, 'test.db');
    try {
      saveGoal(setup(file).repos, goalInput);
      saveDarkMode(setup(file).repos, true);
      const reopened = setup(file).repos;
      expect(loadActiveGoal(reopened)?.title).toBe('日商簿記2級');
      expect(loadDarkMode(reopened)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('settings', () => {
  it('dark mode follows the system (null) until chosen, then persists', () => {
    const { repos } = setup();
    expect(loadDarkMode(repos)).toBeNull();
    saveDarkMode(repos, true);
    expect(loadDarkMode(repos)).toBe(true);
    saveDarkMode(repos, false);
    expect(loadDarkMode(repos)).toBe(false);
  });

  it('reminder defaults to off 21:00', () => {
    const { repos } = setup();
    expect(loadReminder(repos)).toEqual(DEFAULT_REMINDER);
    expect(describeReminder(DEFAULT_REMINDER)).toBe('オフ');
  });

  it('parses reminder times strictly', () => {
    expect(parseReminderTime('21:00')).toEqual({ hour: 21, minute: 0 });
    expect(parseReminderTime('9:05')).toEqual({ hour: 9, minute: 5 });
    expect(parseReminderTime('24:00')).toBeUndefined();
    expect(parseReminderTime('12:60')).toBeUndefined();
    expect(parseReminderTime('noon')).toBeUndefined();
  });

  it('enabling schedules at the chosen time and persists', async () => {
    const { repos } = setup();
    const fake = fakeScheduler();
    const next: ReminderSettings = { enabled: true, hour: 7, minute: 30 };
    expect(await saveReminder(repos, fake.scheduler, next)).toEqual({ ok: true, reminder: next });
    expect(fake.scheduled).toEqual([[7, 30]]);
    expect(loadReminder(repos)).toEqual(next);
    expect(loadMyPageSummary(repos, Date.now()).reminderSummary).toBe('毎日 07:30');
  });

  it('permission denied keeps the reminder off and schedules nothing', async () => {
    const { repos } = setup();
    const fake = fakeScheduler(false);
    const result = await saveReminder(repos, fake.scheduler, { enabled: true, hour: 8, minute: 0 });
    expect(result).toEqual({
      ok: false,
      reason: 'permission-denied',
      reminder: { enabled: false, hour: 8, minute: 0 },
    });
    expect(fake.scheduled).toHaveLength(0);
    expect(loadReminder(repos)).toEqual({ enabled: false, hour: 8, minute: 0 });
  });

  it('disabling cancels only the reminder', async () => {
    const { repos } = setup();
    const fake = fakeScheduler();
    await saveReminder(repos, fake.scheduler, { enabled: true, hour: 8, minute: 0 });
    await saveReminder(repos, fake.scheduler, { enabled: false, hour: 8, minute: 0 });
    expect(fake.cancelled()).toBe(1);
    expect(loadReminder(repos).enabled).toBe(false);
  });

  it('restore re-registers an enabled reminder and ignores a disabled one', async () => {
    const { repos } = setup();
    const fake = fakeScheduler();
    await restoreReminder(repos, fake.scheduler);
    expect(fake.scheduled).toHaveLength(0);
    await saveReminder(repos, fake.scheduler, { enabled: true, hour: 6, minute: 15 });
    await restoreReminder(repos, fake.scheduler);
    expect(fake.scheduled).toEqual([
      [6, 15],
      [6, 15],
    ]);
  });

  it('shares the existing review setting instead of duplicating it', () => {
    const { repos } = setup();
    saveReviewSettings(repos, { ...DEFAULT_REVIEW_SETTINGS, timeLimitEnabled: false });
    expect(loadMyPageSummary(repos, Date.now()).reviewSummary).toBe('制限なし');
    saveReviewSettings(repos, { ...DEFAULT_REVIEW_SETTINGS, timeLimitSeconds: 60 });
    expect(loadMyPageSummary(repos, Date.now()).reviewSummary).toBe('1問60秒');
    expect(loadMyPageSummary(repos, Date.now()).timerSummary).toBe('集中25分・休憩5分');
  });
});

describe('export', () => {
  it('contains every table including goals and settings', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: '韓国語' });
    repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    repos.notes.create({ title: 'n' });
    saveGoal(repos, goalInput);
    saveDarkMode(repos, true);

    const data = JSON.parse(buildExportJson(repos, 123));
    expect(data).toMatchObject({ app: 'tsumi-note', formatVersion: 1, exportedAt: 123 });
    expect(data.folders).toHaveLength(1);
    expect(data.questions).toHaveLength(1);
    expect(data.notes).toHaveLength(1);
    expect(data.goals[0].title).toBe('日商簿記2級');
    expect(data.settings.some((s: { key: string }) => s.key === 'appearance.darkMode')).toBe(true);
    for (const key of ['fsrsStates', 'studySessions', 'answerHistory', 'reviewHistory']) {
      expect(Array.isArray(data[key])).toBe(true);
    }
  });
});
