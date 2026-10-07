import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import type { TimerEvent, TimerState } from './timer-logic';
import { createNotificationSynchronizer } from './timer-notification-sync';

const MESSAGES: Record<TimerEvent, { title: string; body: string }> = {
  focusEnd: { title: '集中時間が終了しました', body: '休憩しましょう。' },
  breakEnd: { title: '休憩が終了しました', body: '次の集中ラウンドを始めましょう。' },
  allDone: { title: 'すべてのラウンドが完了しました', body: 'おつかれさまでした。' },
};

// In the foreground the user sees the screen and feels a haptic; the OS banner is only for background.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
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
  cancelAll: () => Notifications.cancelAllScheduledNotificationsAsync(),
  hasPermission: async () => (await Notifications.getPermissionsAsync()).granted,
  schedule: async (at, event) => {
    await Notifications.scheduleNotificationAsync({
      content: { ...MESSAGES[event], sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    });
  },
});

/** Single entry point: makes scheduled notifications match `state` (none unless running). The latest state wins. */
export function syncTimerNotifications(state: TimerState, now: number): Promise<void> {
  return synchronizer.sync(state, now);
}

export function notifyHaptic(event: TimerEvent): void {
  const type =
    event === 'allDone' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning;
  Haptics.notificationAsync(type).catch(() => undefined);
}
