import { createIdleState, pause, reset, resume, start, type TimerSettings, type TimerState } from './timer-logic';
import {
  createNotificationSynchronizer,
  LONG_ALARM_DURATION_MS,
  LONG_ALARM_REPEATS,
  MAX_PENDING_TIMER_NOTIFICATIONS,
  planAlarm,
  type NotificationBackend,
} from './timer-notification-sync';

const settings: TimerSettings = { focusMinutes: 25, breakMinutes: 5, rounds: 2 };
const T0 = 1_000_000;

type Gate = { promise: Promise<void>; open: () => void };
const gate = (): Gate => {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    open = r;
  });
  return { promise, open };
};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Fake backend: `scheduled` is the notification store; the Nth schedule call waits for `delays[N]`. */
function fakeBackend(delays: Gate[] = []) {
  const scheduled: number[] = [];
  let calls = 0;
  const backend: NotificationBackend = {
    cancelAll: async () => {
      scheduled.length = 0;
    },
    hasPermission: async () => true,
    schedule: async (at) => {
      const g = delays[calls++];
      if (g) await g.promise;
      scheduled.push(at);
    },
  };
  return { backend, scheduled };
}

const running = (at = T0, id = 'run'): TimerState => start(createIdleState(settings), settings, at, () => id);

describe('notification synchronizer', () => {
  it('Case 1: pause before a slow schedule finishes leaves no notifications', async () => {
    const g = gate();
    const { backend, scheduled } = fakeBackend([g]);
    const { sync } = createNotificationSynchronizer(backend);
    const s = running();
    const p1 = sync(s, T0);
    await tick();
    const p2 = sync(pause(s, T0 + 1000), T0 + 1000);
    await tick();
    g.open();
    await Promise.all([p1, p2]);
    expect(scheduled).toHaveLength(0);
  });

  it('Case 2: reset before a slow schedule finishes leaves no notifications', async () => {
    const g = gate();
    const { backend, scheduled } = fakeBackend([g]);
    const { sync } = createNotificationSynchronizer(backend);
    const p1 = sync(running(), T0);
    await tick();
    const p2 = sync(reset(settings), T0 + 1000);
    await tick();
    g.open();
    await Promise.all([p1, p2]);
    expect(scheduled).toHaveLength(0);
  });

  it('Case 3: start -> pause -> resume leaves only the latest running notifications', async () => {
    const g = gate();
    const { backend, scheduled } = fakeBackend([g]);
    const { sync } = createNotificationSynchronizer(backend);
    const s = running();
    const paused = pause(s, T0 + 1000);
    const resumed = resume(paused, T0 + 2000);
    const ps = [sync(s, T0), sync(paused, T0 + 1000), sync(resumed, T0 + 2000)];
    await tick();
    g.open();
    await Promise.all(ps);
    // focusEnd, breakEnd, allDone for 2 rounds, all derived from the resumed target.
    const end = resumed.targetEndAt as number;
    expect(scheduled).toEqual([end, end + 5 * 60_000, end + 30 * 60_000]);
  });

  it('Case 4: an older state finishing late never overwrites the newer state', async () => {
    const slow = gate();
    const { backend, scheduled } = fakeBackend([slow]);
    const { sync } = createNotificationSynchronizer(backend);
    const older = running(T0, 'a');
    const newer = running(T0 + 60_000, 'b');
    const p1 = sync(older, T0);
    await tick();
    const p2 = sync(newer, T0 + 60_000);
    await tick();
    slow.open(); // the older schedule completes after the newer sync was requested
    await Promise.all([p1, p2]);
    const end = newer.targetEndAt as number;
    expect(scheduled).toEqual([end, end + 5 * 60_000, end + 30 * 60_000]);
  });
});

describe('alarm plan (アラーム音)', () => {
  const boundaries = [
    { at: 100_000, event: 'focusEnd' as const },
    { at: 400_000, event: 'allDone' as const },
  ];

  it('短め: one sounding notification per boundary', () => {
    expect(planAlarm(boundaries, 'short')).toEqual([
      { at: 100_000, event: 'focusEnd', boundaryAt: 100_000, repeat: 0, sound: true },
      { at: 400_000, event: 'allDone', boundaryAt: 400_000, repeat: 0, sound: true },
    ]);
  });

  it('無音: one silent notification per boundary', () => {
    expect(planAlarm(boundaries, 'silent').map(({ sound, repeat }) => [sound, repeat])).toEqual([
      [false, 0],
      [false, 0],
    ]);
  });

  it('長め: repeats the standard sound every 5 s for about 30 s', () => {
    const plan = planAlarm(boundaries.slice(0, 1), 'long');
    expect(plan).toHaveLength(LONG_ALARM_REPEATS);
    expect(plan.map(({ at }) => at - 100_000)).toEqual([0, 5000, 10000, 15000, 20000, 25000]);
    expect(plan.every(({ sound, boundaryAt }) => sound && boundaryAt === 100_000)).toBe(true);
    expect(LONG_ALARM_DURATION_MS).toBe(30_000);
  });

  it('長め: never exceeds the pending-notification budget even for a 12-round timer', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ at: i * 600_000, event: 'focusEnd' as const }));
    const plan = planAlarm(many, 'long');
    expect(plan.length).toBeLessThanOrEqual(MAX_PENDING_TIMER_NOTIFICATIONS);
    expect(plan.filter(({ repeat }) => repeat === 0)).toHaveLength(23);
  });

  it('the synchronizer schedules the repeats for the configured mode and honours keepRingingAlarm', async () => {
    const fired: { at: number; repeat: number; sound: boolean }[] = [];
    const cancels: (number | undefined)[] = [];
    const backend: NotificationBackend = {
      cancelAll: async (keep) => {
        cancels.push(keep);
      },
      hasPermission: async () => true,
      getAlarmMode: () => 'long',
      schedule: async (at, _event, alarm) => {
        fired.push({ at, repeat: alarm.repeat, sound: alarm.sound });
      },
    };
    const { sync } = createNotificationSynchronizer(backend);
    const one = { ...settings, rounds: 1 };
    const s = start(createIdleState(one), one, T0, () => 'x');
    await sync(s, T0);
    expect(fired).toHaveLength(LONG_ALARM_REPEATS);
    await sync(s, T0 + 1, { keepRingingAlarm: true });
    expect(cancels).toEqual([undefined, T0 + 1]);
  });
});
