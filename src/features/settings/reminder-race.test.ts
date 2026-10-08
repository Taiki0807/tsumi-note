import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';

import type { ReminderScheduler } from './reminder-notifications';
import { loadReminder, restoreReminder, saveReminder } from './settings-use-cases';

/** Fake OS with one reminder slot (one identifier). Operations take `delay` ticks so they can interleave. */
function fakeOs(opts: { delay?: (op: string) => number; failNext?: Set<string> } = {}) {
  const state = { slot: null as string | null, log: [] as string[], timerSlot: 'timer' };
  const wait = async (op: string) => {
    for (let i = 0; i < (opts.delay?.(op) ?? 0); i++) await Promise.resolve();
  };
  const s: ReminderScheduler = {
    ensurePermission: async () => true,
    schedule: async (h, m) => {
      await wait('schedule');
      if (opts.failNext?.delete('schedule')) throw new Error('schedule');
      state.slot = `${h}:${m}`;
      state.log.push(`schedule ${h}:${m}`);
    },
    cancel: async () => {
      await wait('cancel');
      if (opts.failNext?.delete('cancel')) throw new Error('cancel');
      state.slot = null;
      state.log.push('cancel');
    },
  };
  return { s, state };
}

const repos = () => createRepositories(createTestDeps(createTestDatabase()).deps);
const at = (hour: number, enabled = true) => ({ enabled, hour, minute: 0 });
const osMatchesStore = (r: ReturnType<typeof repos>, slot: string | null) => {
  const stored = loadReminder(r);
  expect(slot).toBe(stored.enabled ? `${stored.hour}:${stored.minute}` : null);
};

describe('reminder OS operations are serialized', () => {
  it('a slow restore does not overwrite a time changed meanwhile (9:00 → 10:00)', async () => {
    const r = repos();
    const os = fakeOs({ delay: (op) => (op === 'schedule' ? 20 : 0) });
    await saveReminder(r, os.s, at(9));
    // Restore starts with 9:00 and is slow; the user changes to 10:00 while it is in flight.
    const restore = restoreReminder(r, os.s);
    const save = saveReminder(r, os.s, at(10));
    await Promise.all([restore, save]);
    expect(loadReminder(r)).toEqual(at(10));
    osMatchesStore(r, os.state.slot);
  });

  it('a restore queued behind a save syncs the latest stored value', async () => {
    const r = repos();
    const os = fakeOs({ delay: () => 5 });
    const save = saveReminder(r, os.s, at(9));
    const restore = restoreReminder(r, os.s); // read happens after the save finished
    await Promise.all([save, restore]);
    expect(os.state.log).toEqual(['schedule 9:0', 'schedule 9:0']);
    osMatchesStore(r, os.state.slot);
  });

  it('ON/OFF racing with restores ends consistent', async () => {
    const r = repos();
    const os = fakeOs({ delay: (op) => (op === 'cancel' ? 15 : 3) });
    await saveReminder(r, os.s, at(9));
    await Promise.all([
      restoreReminder(r, os.s),
      saveReminder(r, os.s, at(9, false)),
      restoreReminder(r, os.s),
      saveReminder(r, os.s, at(9, true)),
      restoreReminder(r, os.s),
      saveReminder(r, os.s, at(9, false)),
      restoreReminder(r, os.s),
    ]);
    expect(loadReminder(r).enabled).toBe(false);
    osMatchesStore(r, os.state.slot);
  });

  it('consecutive time changes end on the last one', async () => {
    const r = repos();
    const os = fakeOs({ delay: (op) => (op === 'schedule' ? 7 : 0) });
    await Promise.all([8, 9, 10, 11, 12].map((h) => saveReminder(r, os.s, at(h))));
    expect(loadReminder(r)).toEqual(at(12));
    expect(os.state.log).toEqual(['8', '9', '10', '11', '12'].map((h) => `schedule ${h}:0`));
    osMatchesStore(r, os.state.slot);
  });

  it('a failed OS call does not block the queue and stays retryable', async () => {
    const r = repos();
    const os = fakeOs({ failNext: new Set(['schedule']) });
    const [failed, ok] = await Promise.all([saveReminder(r, os.s, at(9)), saveReminder(r, os.s, at(10))]);
    expect(failed).toMatchObject({ ok: false, reason: 'schedule-failed' });
    expect(ok.ok).toBe(true);
    osMatchesStore(r, os.state.slot);

    const cancelFail = fakeOs({ failNext: new Set(['cancel']) });
    cancelFail.state.slot = '10:0';
    const off = await saveReminder(r, cancelFail.s, at(10, false));
    expect(off).toMatchObject({ ok: false, reason: 'cancel-failed' });
    expect(loadReminder(r)).toEqual(at(10)); // not recorded as OFF
    expect(await restoreReminder(r, cancelFail.s)).toBe('synced'); // retry succeeds
    osMatchesStore(r, cancelFail.state.slot);
  });

  it('screen re-display and several hooks share one queue', async () => {
    const r = repos();
    const os = fakeOs({ delay: () => 4 });
    await saveReminder(r, os.s, at(9));
    // Two hook instances (old screen + re-displayed screen) restore on mount while a third saves.
    await Promise.all([
      restoreReminder(r, os.s),
      restoreReminder(r, os.s),
      saveReminder(r, os.s, at(10)),
      restoreReminder(r, os.s),
      saveReminder(r, os.s, at(11)),
    ]);
    expect(loadReminder(r)).toEqual(at(11));
    osMatchesStore(r, os.state.slot);
  });

  it('only touches the reminder slot, never the timer notifications', async () => {
    const r = repos();
    const os = fakeOs();
    await Promise.all([saveReminder(r, os.s, at(9)), restoreReminder(r, os.s), saveReminder(r, os.s, at(9, false))]);
    expect(os.state.timerSlot).toBe('timer');
    expect(os.state.log.every((l) => l.startsWith('schedule') || l === 'cancel')).toBe(true);
  });
});
