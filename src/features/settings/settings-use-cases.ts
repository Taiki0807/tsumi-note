import type { Goal, Repositories } from '@/db/repositories';
import {
  APP_SETTING_KEYS,
  describeReminder,
  parseDarkMode,
  parseReminder,
  serializeReminder,
  type DarkModeSetting,
  type ReminderSettings,
} from '@/domain/app-settings';
import {
  applyPlanEdit,
  daysUntilExam,
  normalizeGoal,
  togglePlanItem,
  validateGoal,
  type GoalInput,
} from '@/domain/goal';
import { loadReviewSettings } from '@/features/review/review-use-cases';
import type { TimerSettings } from '@/features/timer/timer-logic';
import { createTimerStorage } from '@/features/timer/timer-storage';

import { applyReminder, type ReminderResult, type ReminderScheduler } from './reminder-notifications';

type SettingsRepos = Pick<Repositories, 'settings'>;

// ---------- Goal ----------

export function loadActiveGoal({ goals }: Pick<Repositories, 'goals'>): Goal | undefined {
  return goals.getActive();
}

/**
 * Creates or edits the single active goal. `input.actionPlan` is the plain text of the edit form
 * (one item per line); items that keep their text keep their check state. Throws on invalid input
 * so nothing half-valid is stored.
 */
export function saveGoal({ goals }: Pick<Repositories, 'goals'>, input: GoalInput): Goal {
  if (!validateGoal(input)) throw new Error('Invalid goal');
  const normalized = normalizeGoal(input);
  const previous = goals.getActive()?.actionPlan ?? '';
  return goals.save({ ...normalized, actionPlan: applyPlanEdit(previous, normalized.actionPlan) });
}

/** Checks / unchecks one 行動プラン item and persists it; other items keep their state. */
export function toggleActionPlanItem(
  { goals }: Pick<Repositories, 'goals'>,
  index: number,
): Goal | undefined {
  const goal = goals.getActive();
  if (!goal) return undefined;
  const { title, examDay, objective, purpose } = goal;
  return goals.save({
    title,
    examDay,
    objective,
    purpose,
    actionPlan: togglePlanItem(goal.actionPlan, index),
  });
}

export function deleteGoal({ goals }: Pick<Repositories, 'goals'>): void {
  goals.removeActive();
}

// ---------- Appearance ----------

export function loadDarkMode({ settings }: SettingsRepos): DarkModeSetting {
  return parseDarkMode(settings.get(APP_SETTING_KEYS.darkMode));
}

export function saveDarkMode({ settings }: SettingsRepos, dark: boolean): void {
  settings.set(APP_SETTING_KEYS.darkMode, String(dark));
}

// ---------- Reminder ----------

export function loadReminder({ settings }: SettingsRepos): ReminderSettings {
  return parseReminder((key) => settings.get(key));
}

function storeReminder(repos: SettingsRepos, reminder: ReminderSettings): void {
  for (const [key, value] of Object.entries(serializeReminder(reminder))) repos.settings.set(key, value);
}

/**
 * The OS is changed first and SQLite is written only afterwards, so the stored state never claims
 * something the OS did not do:
 * - success: the requested settings are stored.
 * - permission denied: nothing can be delivered, so the reminder is stored as off (a stale schedule is
 *   cancelled best-effort; the launch-time {@link restoreReminder} retries it).
 * - schedule / cancel failed: the previous settings stay stored and shown, and the caller reports the
 *   error so the user can retry. Nothing is recorded as disabled while the OS may still hold a schedule.
 */
export async function saveReminder(
  repos: SettingsRepos,
  scheduler: ReminderScheduler,
  next: ReminderSettings,
): Promise<ReminderResult> {
  const previous = loadReminder(repos);
  const outcome = await applyReminder(scheduler, next);
  if (outcome.ok) {
    storeReminder(repos, next);
    return { ok: true, reminder: next };
  }
  if (outcome.reason === 'permission-denied') {
    const off = { ...next, enabled: false };
    // Best-effort: if this fails the next launch retries (the stored state is "off").
    await applyReminder(scheduler, off);
    storeReminder(repos, off);
    return { ok: false, reason: outcome.reason, reminder: off };
  }
  return { ok: false, reason: outcome.reason, reminder: previous };
}

/**
 * Re-syncs the OS with the stored reminder on every launch (also after reinstall, a permission change,
 * or a failed cancel): an enabled reminder is re-registered, a disabled one is cancelled again.
 * Failures are left for the next launch / the next user action; the stored state is not rewritten.
 */
export async function restoreReminder(repos: SettingsRepos, scheduler: ReminderScheduler): Promise<void> {
  const reminder = loadReminder(repos);
  const outcome = await applyReminder(scheduler, reminder);
  // A permission revoked in 設定 means nothing is delivered any more: reflect that as off.
  if (!outcome.ok && outcome.reason === 'permission-denied')
    storeReminder(repos, { ...reminder, enabled: false });
}

// ---------- Timer settings (Phase 2 storage, edited from マイページ) ----------

/** Reuses the timer's own storage, so マイページ and the timer tab always read and write the same values. */
export function loadTimerSettings(repos: Repositories): TimerSettings {
  return createTimerStorage(repos).loadSettings();
}

/** Clamped and persisted; a running session keeps its snapshot and the new values apply from the next start. */
export function saveTimerSettings(repos: Repositories, input: TimerSettings): TimerSettings {
  return createTimerStorage(repos).saveSettings(input);
}

export function describeTimerSettings(timer: TimerSettings): string {
  return `集中${timer.focusMinutes}分・休憩${timer.breakMinutes}分`;
}

// ---------- My page ----------

export type MyPageSummary = {
  goal: { title: string; daysRemaining: number | null } | null;
  timerSummary: string;
  reviewSummary: string;
  reminderSummary: string;
  darkMode: DarkModeSetting;
  noteCount: number;
  questionCount: number;
  studySeconds: number;
};

export function loadMyPageSummary(repos: Repositories, now: number): MyPageSummary {
  const goal = repos.goals.getActive();
  const timer = loadTimerSettings(repos);
  const review = loadReviewSettings(repos);
  return {
    goal: goal ? { title: goal.title, daysRemaining: daysUntilExam(goal.examDay, now) } : null,
    timerSummary: describeTimerSettings(timer),
    reviewSummary: review.timeLimitEnabled ? `1問${review.timeLimitSeconds}秒` : '制限なし',
    reminderSummary: describeReminder(loadReminder(repos)),
    darkMode: loadDarkMode(repos),
    noteCount: repos.notes.list().length,
    questionCount: Object.values(repos.questions.countsByFolder()).reduce((a, b) => a + b, 0),
    studySeconds: repos.studySessions.listSince(0).reduce((sum, s) => sum + s.durationSeconds, 0),
  };
}
