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
import { daysUntilExam, normalizeGoal, validateGoal, type GoalInput } from '@/domain/goal';
import { loadReviewSettings } from '@/features/review/review-use-cases';
import { createTimerStorage } from '@/features/timer/timer-storage';

import { applyReminder, type ReminderResult, type ReminderScheduler } from './reminder-notifications';

type SettingsRepos = Pick<Repositories, 'settings'>;

// ---------- Goal ----------

export function loadActiveGoal({ goals }: Pick<Repositories, 'goals'>): Goal | undefined {
  return goals.getActive();
}

/** Creates or edits the single active goal. Throws on invalid input so nothing half-valid is stored. */
export function saveGoal({ goals }: Pick<Repositories, 'goals'>, input: GoalInput): Goal {
  if (!validateGoal(input)) throw new Error('Invalid goal');
  return goals.save(normalizeGoal(input));
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

/**
 * Saves the reminder after the OS accepted it. Enabling without permission stores the reminder
 * as off so the stored state never claims a reminder the OS will not deliver.
 */
export async function saveReminder(
  repos: SettingsRepos,
  scheduler: ReminderScheduler,
  next: ReminderSettings,
): Promise<ReminderResult> {
  const result = await applyReminder(scheduler, next);
  const stored = result.ok ? result.reminder : { ...next, enabled: false };
  for (const [key, value] of Object.entries(serializeReminder(stored))) repos.settings.set(key, value);
  return result;
}

/** Re-registers the stored reminder with the OS (e.g. after reinstall / permission change). */
export async function restoreReminder(repos: SettingsRepos, scheduler: ReminderScheduler): Promise<void> {
  const reminder = loadReminder(repos);
  if (reminder.enabled) await saveReminder(repos, scheduler, reminder);
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
  const timer = createTimerStorage(repos).loadSettings();
  const review = loadReviewSettings(repos);
  return {
    goal: goal ? { title: goal.title, daysRemaining: daysUntilExam(goal.examDate, now) } : null,
    timerSummary: `集中${timer.focusMinutes}分・休憩${timer.breakMinutes}分`,
    reviewSummary: review.timeLimitEnabled ? `1問${review.timeLimitSeconds}秒` : '制限なし',
    reminderSummary: describeReminder(loadReminder(repos)),
    darkMode: loadDarkMode(repos),
    noteCount: repos.notes.list().length,
    questionCount: Object.values(repos.questions.countsByFolder()).reduce((a, b) => a + b, 0),
    studySeconds: repos.studySessions.listSince(0).reduce((sum, s) => sum + s.durationSeconds, 0),
  };
}
