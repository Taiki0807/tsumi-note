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
  const { title, objective, purpose } = goal;
  // No examDay: a check-off never touches the exam day (nor an unresolved legacy value).
  return goals.save({
    title,
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
 * - permission denied (on a user request to enable): the stale schedule is cancelled first and off is
 *   stored only if that succeeded; a failed cancel keeps the previous state and reports cancel-failed.
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
    // The user just asked for ON and the OS refused: nothing may be scheduled. Off is stored only once
    // any stale schedule is confirmed cancelled; otherwise the previous state stays and the user retries.
    const off = { ...next, enabled: false };
    const cancelled = await applyReminder(scheduler, off);
    if (!cancelled.ok) return { ok: false, reason: 'cancel-failed', reminder: previous };
    storeReminder(repos, off);
    return { ok: false, reason: 'permission-denied', reminder: off };
  }
  return { ok: false, reason: outcome.reason, reminder: previous };
}

/**
 * - synced: the OS matches the stored intent (scheduled when ON, cancelled when OFF).
 * - permission-denied: the user wants it ON but the OS forbids delivery; the stale schedule is cancelled.
 * - sync-failed: the OS could not be brought in line; retried on the next launch / foreground.
 */
export type ReminderSyncStatus = 'synced' | 'permission-denied' | 'sync-failed';

/**
 * Re-syncs the OS with the stored reminder (launch, return to foreground, reminder screen). The stored
 * `enabled` is the user's intent and is never rewritten here: a revoked permission is not the same as
 * the user switching it off, so when the permission comes back the next sync schedules it again.
 * While permission is denied the reminder's own schedule is still cancelled (best effort) so a stale
 * schedule cannot fire after the permission returns; only the reminder identifier is touched.
 */
export async function restoreReminder(
  repos: SettingsRepos,
  scheduler: ReminderScheduler,
): Promise<ReminderSyncStatus> {
  const reminder = loadReminder(repos);
  const outcome = await applyReminder(scheduler, reminder);
  if (outcome.ok) return 'synced';
  if (outcome.reason !== 'permission-denied') return 'sync-failed';
  const cancelled = await applyReminder(scheduler, { ...reminder, enabled: false });
  return cancelled.ok ? 'permission-denied' : 'sync-failed';
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
