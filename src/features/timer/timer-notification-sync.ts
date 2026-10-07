import { planBoundaries, type TimerEvent, type TimerState } from './timer-logic';

export type NotificationBackend = {
  cancelAll: () => Promise<void>;
  hasPermission: () => Promise<boolean>;
  schedule: (at: number, event: TimerEvent) => Promise<void>;
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

  async function apply(revision: number, state: TimerState, now: number): Promise<void> {
    if (revision !== latest) return;
    await backend.cancelAll();
    const plan = state.status === 'running' ? planBoundaries(state).filter(({ at }) => at > now) : [];
    if (plan.length === 0 || revision !== latest) return;
    if (!(await backend.hasPermission())) return;
    for (const { at, event } of plan) {
      if (revision !== latest) return;
      await backend.schedule(at, event);
    }
    // A newer call may have arrived during the last await; it runs next and cancels everything first.
  }

  /** Makes the scheduled notifications reflect `state`. Resolves once this call (or a newer one) has been applied. */
  function sync(state: TimerState, now: number): Promise<void> {
    const revision = ++latest;
    queue = queue.then(() => apply(revision, state, now)).catch(() => undefined); // best-effort
    return queue;
  }

  return { sync };
}
