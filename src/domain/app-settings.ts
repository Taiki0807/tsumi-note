/**
 * App-level settings (PRODUCT_SPEC §17): Dark Mode and the daily study reminder.
 * Stored as strings in the shared key-value `settings` table next to the Phase 2-5 timer / review
 * keys (`timer.*`, `review.*`); nothing is duplicated.
 */
export type ReminderSettings = {
  enabled: boolean;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
};

/** `null` = follow the system appearance (until the user flips the switch). */
export type DarkModeSetting = boolean | null;

/** Figma 15 shows 「毎日 21:00」. The reminder is off until the user opts in and grants permission. */
export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 21, minute: 0 };

export const APP_SETTING_KEYS = {
  darkMode: 'appearance.darkMode',
  reminderEnabled: 'notification.reminderEnabled',
  reminderTime: 'notification.reminderTime',
} as const;

export function parseDarkMode(raw: string | undefined): DarkModeSetting {
  return raw === 'true' ? true : raw === 'false' ? false : null;
}

export function formatReminderTime({ hour, minute }: Pick<ReminderSettings, 'hour' | 'minute'>): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** `HH:mm` → hour / minute, or undefined when malformed or out of range. */
export function parseReminderTime(text: string): Pick<ReminderSettings, 'hour' | 'minute'> | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : undefined;
}

export function parseReminder(get: (key: string) => string | undefined): ReminderSettings {
  const time = parseReminderTime(get(APP_SETTING_KEYS.reminderTime) ?? '');
  return {
    enabled: get(APP_SETTING_KEYS.reminderEnabled) === 'true',
    hour: time?.hour ?? DEFAULT_REMINDER.hour,
    minute: time?.minute ?? DEFAULT_REMINDER.minute,
  };
}

export function serializeReminder(reminder: ReminderSettings): Record<string, string> {
  return {
    [APP_SETTING_KEYS.reminderEnabled]: String(reminder.enabled),
    [APP_SETTING_KEYS.reminderTime]: formatReminderTime(reminder),
  };
}

/** Figma 15 通知 row subtitle. */
export function describeReminder(reminder: ReminderSettings): string {
  return reminder.enabled ? `毎日 ${formatReminderTime(reminder)}` : 'オフ';
}

/** Identifier of the daily reminder, so timer notifications can be managed without touching it. */
export const REMINDER_NOTIFICATION_ID = 'daily-study-reminder';
