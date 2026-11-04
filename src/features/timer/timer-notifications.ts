import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import {
  DEFAULT_TIMER_ALERTS,
  REMINDER_NOTIFICATION_ID,
  type TimerAlertSettings,
} from '@/domain/app-settings';

import type { TimerEvent, TimerState } from './timer-logic';
import { createNotificationSynchronizer } from './timer-notification-sync';

const MESSAGES: Record<TimerEvent, { title: string; body: string }> = {
  focusEnd: { title: '集中時間が終了しました', body: '休憩しましょう。' },
  breakEnd: { title: '休憩が終了しました', body: '次の集中ラウンドを始めましょう。' },
  allDone: { title: 'すべてのラウンドが完了しました', body: 'おつかれさまでした。' },
};

/**
 * Current アラーム音 / バイブレーション choice (タイマー画面 / マイページ › 通知). Synced from storage by the timer hook.
 *
 * What iOS guarantees: a scheduled local notification is delivered by the OS even when the app is suspended
 * or killed, with its sound (the bundled ~28 s alarm for 長め).
 * What iOS does NOT guarantee: sound while the silent switch / a Focus mutes it, exact timing (can be a bit
 * late), or that the app runs any code at the boundary in the background (so a ringing alarm cannot be
 * stopped from the app). In the foreground the OS plays a sound only when the handler below allows it.
 */
let alerts: TimerAlertSettings = DEFAULT_TIMER_ALERTS;

export function configureTimerAlerts(next: TimerAlertSettings): void {
  alerts = next;
}

/**
 * Foreground presentation, decided per notification:
 * - Timer end notification (marked with `timerNotification`): banner (+ list entry) so the end is noticeable
 *   while the app is open; it plays its own sound (the bundled alarm for 長め) unless the mode is 無音.
 * - Anything else (the daily reminder): unchanged, no banner and no sound while the app is open.
 * Sound is still subject to the iOS silent switch / Focus; the haptic is played by `notifyHaptic`.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { timerNotification?: boolean } | null;
    const timer = data?.timerNotification === true;
    return {
      shouldShowBanner: timer,
      shouldShowList: timer,
      shouldPlaySound: timer && alerts.alarmMode !== 'silent',
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
  cancelAll: async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(({ identifier }) => identifier !== REMINDER_NOTIFICATION_ID)
        .map(({ identifier }) => Notifications.cancelScheduledNotificationAsync(identifier)),
    );
  },
  hasPermission: async () => (await Notifications.getPermissionsAsync()).granted,
  getAlarmMode: () => alerts.alarmMode,
  // 長め: bundled alarm file, 短め: standard iOS sound ('default'), 無音: `false`.
  schedule: async (at, event, alarm) => {
    await Notifications.scheduleNotificationAsync({
      content: { ...MESSAGES[event], sound: alarm.sound, data: { timerNotification: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    });
  },
});

/** Single entry point: makes scheduled notifications match `state` (none unless running). The latest state wins. */
export function syncTimerNotifications(state: TimerState, now: number): Promise<void> {
  return synchronizer.sync(state, now);
}

export function notifyHaptic(event: TimerEvent): void {
  if (!alerts.vibration) return;
  const type =
    event === 'allDone' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning;
  Haptics.notificationAsync(type).catch(() => undefined);
}
