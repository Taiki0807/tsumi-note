import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import {
  DEFAULT_TIMER_ALERTS,
  REMINDER_NOTIFICATION_ID,
  type TimerAlertSettings,
} from '@/domain/app-settings';

import type { TimerEvent, TimerState } from './timer-logic';
import { createNotificationSynchronizer, type SyncOptions } from './timer-notification-sync';

const MESSAGES: Record<TimerEvent, { title: string; body: string }> = {
  focusEnd: { title: '集中時間が終了しました', body: '休憩しましょう。' },
  breakEnd: { title: '休憩が終了しました', body: '次の集中ラウンドを始めましょう。' },
  allDone: { title: 'すべてのラウンドが完了しました', body: 'おつかれさまでした。' },
};

/**
 * Current アラーム音 / バイブレーション choice (タイマー画面 / マイページ › 通知). Synced from storage by the timer hook.
 *
 * What iOS guarantees: a scheduled local notification is delivered by the OS even when the app is suspended
 * or killed, with the standard sound; the separate repeat notifications of 長め are scheduled the same way.
 * What iOS does NOT guarantee: sound while the silent switch / a Focus mutes it, exact timing (can be a bit
 * late), that every 長め repeat rings (the OS may coalesce or throttle notifications of one app), or that the
 * app runs any code at the boundary in the background (no timer / audio keeps running there, so the alarm
 * cannot be stopped or restarted from the app until it is opened). In the foreground the OS plays a sound
 * only when the handler below allows it.
 */
let alerts: TimerAlertSettings = DEFAULT_TIMER_ALERTS;

export function configureTimerAlerts(next: TimerAlertSettings): void {
  alerts = next;
}

/** Marks a notification as the timer's (the daily reminder never carries it). */
type TimerNotificationData = { timerBoundaryAt: number; timerRepeat: number };

function timerData(data: unknown): TimerNotificationData | undefined {
  const d = data as Partial<TimerNotificationData> | null | undefined;
  return typeof d?.timerBoundaryAt === 'number' && typeof d.timerRepeat === 'number'
    ? { timerBoundaryAt: d.timerBoundaryAt, timerRepeat: d.timerRepeat }
    : undefined;
}

/**
 * Foreground presentation, decided per notification:
 * - Timer end notification: banner (+ list entry) so the end is noticeable while the app is open. Sound follows
 *   the アラーム mode. The sound-only repeats of 長め (repeat > 0) show no extra banner, they only play.
 * - Anything else (the daily reminder): unchanged, no banner and no sound while the app is open.
 * Sound is still subject to the iOS silent switch / Focus; the haptic is played by `notifyHaptic`.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const timer = timerData(notification.request.content.data);
    return {
      shouldShowBanner: timer?.timerRepeat === 0,
      shouldShowList: timer?.timerRepeat === 0,
      shouldPlaySound: timer !== undefined && alerts.alarmMode !== 'silent',
      shouldSetBadge: false,
    };
  },
});

/** Asks for permission once. A denial never blocks the timer: it just means no local notifications. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const synchronizer = createNotificationSynchronizer({
  // Only the timer's own notifications: the daily study reminder (Phase 7) must survive a timer reset.
  cancelAll: async (keepBoundariesUpTo) => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(({ identifier }) => identifier !== REMINDER_NOTIFICATION_ID)
        .filter(({ content }) => {
          const timer = timerData(content.data);
          return (
            keepBoundariesUpTo === undefined ||
            timer === undefined ||
            timer.timerBoundaryAt > keepBoundariesUpTo
          );
        })
        .map(({ identifier }) => Notifications.cancelScheduledNotificationAsync(identifier)),
    );
  },
  hasPermission: async () => (await Notifications.getPermissionsAsync()).granted,
  getAlarmMode: () => alerts.alarmMode,
  // Standard iOS notification sound ('default'), never a bundled file; `false` = silent notification.
  schedule: async (at, event, alarm) => {
    const data: TimerNotificationData = { timerBoundaryAt: alarm.boundaryAt, timerRepeat: alarm.repeat };
    await Notifications.scheduleNotificationAsync({
      content: { ...MESSAGES[event], sound: alarm.sound ? 'default' : false, data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    });
  },
});

/** Single entry point: makes scheduled notifications match `state` (none unless running). The latest state wins. */
export function syncTimerNotifications(state: TimerState, now: number, options?: SyncOptions): Promise<void> {
  return synchronizer.sync(state, now, options);
}

export function notifyHaptic(event: TimerEvent): void {
  if (!alerts.vibration) return;
  const type =
    event === 'allDone' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning;
  Haptics.notificationAsync(type).catch(() => undefined);
}
