import * as Notifications from 'expo-notifications';

import { REMINDER_NOTIFICATION_ID, type ReminderSettings } from '@/domain/app-settings';

/** OS side of the daily reminder. Kept separate from the timer's notifications (own identifier). */
export type ReminderScheduler = {
  /** Asks for permission if needed; resolves whether notifications may be delivered. */
  ensurePermission: () => Promise<boolean>;
  schedule: (hour: number, minute: number) => Promise<void>;
  cancel: () => Promise<void>;
};

export const reminderScheduler: ReminderScheduler = {
  ensurePermission: async () => {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      return (await Notifications.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  },
  schedule: async (hour, minute) => {
    // Same identifier replaces the previous schedule, so changing the time never duplicates it.
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_NOTIFICATION_ID,
      content: { title: '学習の時間です', body: '今日の学習を記録しましょう。', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  },
  cancel: async () => {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_NOTIFICATION_ID);
  },
};

export type ReminderFailure = 'permission-denied' | 'schedule-failed' | 'cancel-failed';

/** `reminder` is always the state that is actually stored / in effect, so callers never show a guess. */
export type ReminderResult =
  | { ok: true; reminder: ReminderSettings }
  | { ok: false; reason: ReminderFailure; reminder: ReminderSettings };

export type OsOutcome = { ok: true } | { ok: false; reason: ReminderFailure };

/**
 * Applies reminder settings to the OS and reports whether the OS really reached the requested state.
 * Turning it on requires permission; on denial nothing is scheduled. Only the reminder's own
 * identifier is touched, so timer notifications are never cancelled. The timer never depends on this.
 */
export async function applyReminder(
  scheduler: ReminderScheduler,
  reminder: ReminderSettings,
): Promise<OsOutcome> {
  if (!reminder.enabled) {
    try {
      await scheduler.cancel();
      return { ok: true };
    } catch {
      return { ok: false, reason: 'cancel-failed' };
    }
  }
  let granted: boolean;
  try {
    granted = await scheduler.ensurePermission();
  } catch {
    granted = false;
  }
  if (!granted) return { ok: false, reason: 'permission-denied' };
  try {
    await scheduler.schedule(reminder.hour, reminder.minute);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'schedule-failed' };
  }
}
