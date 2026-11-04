import type { TimerAlarmMode } from '@/domain/app-settings';

import { planBoundaries, type TimerEvent, type TimerState } from './timer-logic';

/**
 * 長め alarm = the iOS standard notification sound (`sound: 'default'`) repeated by scheduling several
 * local notifications a few seconds apart. No custom audio file is bundled.
 *
 * Why this shape (what iOS lets us do):
 * - A local notification plays its sound once, and iOS cuts a notification sound off at 30 seconds at most,
 *   so ~30 s is the longest a single notification could ever ring; 長め targets the same length.
 * - The default sound is 1-2 s, so one repeat every 5 s (6 repeats: 0, 5, ... 25 s) leaves an audible
 *   gap yet ends around the 30 s mark.
 * - iOS keeps at most 64 pending local notifications per app (the closest ones win). The daily study
 *   reminder uses one slot, and a 12-round timer has 23 boundaries, so repeats shrink to fit
 *   (`planAlarm`).
 */
export const LONG_ALARM_REPEAT_INTERVAL_MS = 5_000;
export const LONG_ALARM_REPEATS = 6;
export const LONG_ALARM_DURATION_MS = LONG_ALARM_REPEAT_INTERVAL_MS * LONG_ALARM_REPEATS; // 30 s
/** iOS pending local notification limit minus the daily reminder's slot. */
export const MAX_PENDING_TIMER_NOTIFICATIONS = 63;

export type ScheduledAlarm = {
  /** When this notification fires. */
  at: number;
  event: TimerEvent;
  /** The timer boundary this notification belongs to (`at` of repeat 0). */
  boundaryAt: number;
  /** 0 = the notification that announces the boundary; > 0 = a sound-only repeat of the 長め alarm. */
  repeat: number;
  sound: boolean;
};

/** Expands timer boundaries into the notifications to schedule for `mode`. Pure. */
export function planAlarm(
  boundaries: { at: number; event: TimerEvent }[],
  mode: TimerAlarmMode,
): ScheduledAlarm[] {
  const repeats =
    mode === 'long'
      ? Math.max(
          1,
          Math.min(
            LONG_ALARM_REPEATS,
            Math.floor(MAX_PENDING_TIMER_NOTIFICATIONS / Math.max(1, boundaries.length)),
          ),
        )
      : 1;
  return boundaries.flatMap(({ at, event }) =>
    Array.from({ length: repeats }, (_, repeat) => ({
      at: at + repeat * LONG_ALARM_REPEAT_INTERVAL_MS,
      event,
      boundaryAt: at,
      repeat,
      sound: mode !== 'silent',
    })),
  );
}

export type NotificationBackend = {
  /**
   * Cancels the timer's notifications. With `keepBoundariesUpTo`, notifications of boundaries at or before
   * that time (an alarm that is ringing right now) are left alone.
   */
  cancelAll: (keepBoundariesUpTo?: number) => Promise<void>;
  hasPermission: () => Promise<boolean>;
  schedule: (at: number, event: TimerEvent, alarm: ScheduledAlarm) => Promise<void>;
  /** Defaults to 短め. */
  getAlarmMode?: () => TimerAlarmMode;
};

export type SyncOptions = {
  /** Let the alarm of a boundary that has just passed keep ringing (foreground tick) instead of cancelling it. */
  keepRingingAlarm?: boolean;
};

/**
 * TimerState -> scheduled notifications, in one place.
 *
 * Every call takes a revision number and runs on a single queue, so backend operations never
 * interleave. A queued call whose revision is no longer the latest is skipped, and a running
 * one stops scheduling as soon as it notices it is stale. The last call to run is always the
 * latest one, so the final notification set matches the latest state regardless of how long
 * each backend call takes.
 */
export function createNotificationSynchronizer(backend: NotificationBackend) {
  let latest = 0;
  let queue: Promise<void> = Promise.resolve();

  async function apply(
    revision: number,
    state: TimerState,
    now: number,
    options: SyncOptions,
  ): Promise<void> {
    if (revision !== latest) return;
    await backend.cancelAll(options.keepRingingAlarm ? now : undefined);
    const boundaries = state.status === 'running' ? planBoundaries(state).filter(({ at }) => at > now) : [];
    if (boundaries.length === 0 || revision !== latest) return;
    if (!(await backend.hasPermission())) return;
    for (const alarm of planAlarm(boundaries, backend.getAlarmMode?.() ?? 'short')) {
      if (revision !== latest) return;
      await backend.schedule(alarm.at, alarm.event, alarm);
    }
    // A newer call may have arrived during the last await; it runs next and cancels everything first.
  }

  /** Makes the scheduled notifications reflect `state`. Resolves once this call (or a newer one) has been applied. */
  function sync(state: TimerState, now: number, options: SyncOptions = {}): Promise<void> {
    const revision = ++latest;
    queue = queue.then(() => apply(revision, state, now, options)).catch(() => undefined); // best-effort
    return queue;
  }

  return { sync };
}
