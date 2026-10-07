import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import { planBoundaries, type TimerEvent, type TimerState } from './timer-logic';

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

export async function cancelTimerNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Notifications are best-effort.
  }
}

/** Replaces all scheduled notifications with the future boundaries of the running timer. */
export async function scheduleTimerNotifications(state: TimerState, now: number): Promise<void> {
  await cancelTimerNotifications();
  try {
    const granted = (await Notifications.getPermissionsAsync()).granted;
    if (!granted) return;
    for (const { at, event } of planBoundaries(state)) {
      if (at <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: { ...MESSAGES[event], sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
      });
    }
  } catch {
    // Notifications are best-effort.
  }
}

export function notifyHaptic(event: TimerEvent): void {
  const type =
    event === 'allDone' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning;
  Haptics.notificationAsync(type).catch(() => undefined);
}
