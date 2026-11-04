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
  timerSound: 'notification.timerSound',
  timerVibration: 'notification.timerVibration',
  timerAlarmMode: 'notification.timerAlarmMode',
} as const;

/**
 * タイマー終了時のアラーム音: 長め = iOS標準の通知音を約30秒繰り返す / 短め = 通知音を1回 / 無音。
 * 端末固有の設定なので同期しない（同期対象の `timer.*` キーは focusMinutes / breakMinutes / rounds のみ）。
 */
export type TimerAlarmMode = 'long' | 'short' | 'silent';

export const TIMER_ALARM_MODES: readonly TimerAlarmMode[] = ['long', 'short', 'silent'];

export const TIMER_ALARM_MODE_LABELS: Record<TimerAlarmMode, string> = {
  long: '長め',
  short: '短め',
  silent: '無音',
};

/**
 * Timer end alerts. `sound` is always `alarmMode !== 'silent'`; it stays as the older ON/OFF value so the
 * 通知設定 switch and data written by earlier versions keep working.
 */
export type TimerAlertSettings = {
  sound: boolean;
  vibration: boolean;
  alarmMode: TimerAlarmMode;
};

/** Both on by default: the sound already played (once = 短め) before it became a setting. */
export const DEFAULT_TIMER_ALERTS: TimerAlertSettings = { sound: true, vibration: true, alarmMode: 'short' };

export function parseTimerAlarmMode(raw: string | undefined): TimerAlarmMode | undefined {
  return TIMER_ALARM_MODES.find((mode) => mode === raw);
}

export function withAlarmMode(alerts: TimerAlertSettings, alarmMode: TimerAlarmMode): TimerAlertSettings {
  return { ...alerts, alarmMode, sound: alarmMode !== 'silent' };
}

/** The 通知音 switch: OFF = 無音; ON restores the last audible mode (or 短め after 無音). */
export function withSound(alerts: TimerAlertSettings, sound: boolean): TimerAlertSettings {
  if (!sound) return withAlarmMode(alerts, 'silent');
  return withAlarmMode(alerts, alerts.alarmMode === 'silent' ? 'short' : alerts.alarmMode);
}

export function parseTimerAlerts(get: (key: string) => string | undefined): TimerAlertSettings {
  const read = (key: string, fallback: boolean) => {
    const raw = get(key);
    return raw === 'true' ? true : raw === 'false' ? false : fallback;
  };
  const sound = read(APP_SETTING_KEYS.timerSound, DEFAULT_TIMER_ALERTS.sound);
  // Backward compatible: without a stored mode it follows the old ON/OFF value (ON = 短め, as before).
  // A stored mode wins over a conflicting `sound` value so the two can never disagree.
  const alarmMode = parseTimerAlarmMode(get(APP_SETTING_KEYS.timerAlarmMode)) ?? (sound ? 'short' : 'silent');
  return {
    sound: alarmMode !== 'silent',
    vibration: read(APP_SETTING_KEYS.timerVibration, DEFAULT_TIMER_ALERTS.vibration),
    alarmMode,
  };
}

export function serializeTimerAlerts(alerts: TimerAlertSettings): Record<string, string> {
  return {
    [APP_SETTING_KEYS.timerSound]: String(alerts.alarmMode !== 'silent'),
    [APP_SETTING_KEYS.timerVibration]: String(alerts.vibration),
    [APP_SETTING_KEYS.timerAlarmMode]: alerts.alarmMode,
  };
}

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
