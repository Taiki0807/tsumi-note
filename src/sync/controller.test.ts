import { createSyncController, type ControllerEvent } from './controller';
import { SyncStoppedError, SyncUpdateRequiredError, type SyncSummary } from './engine';
import { SyncAuthError, SyncNetworkError, SyncServerError } from './http-transport';

const OK: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0 };

function setup(run: () => Promise<SyncSummary>) {
  const events: ControllerEvent[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const controller = createSyncController({
    run,
    onChange: (e) => events.push(e),
    backoffMs: [10, 20, 40],
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimer: (h) => {
      timers[h as number] = { fn: () => {}, ms: -1 };
    },
  });
  return { controller, events, timers };
}

describe('sync controller', () => {
  it('成功すると idle になる', async () => {
    const { controller, events } = setup(async () => OK);
    await controller.trigger();
    expect(events.map((e) => e.status)).toEqual(['syncing', 'idle']);
  });

  it('同時に1つだけ実行し、実行中の要求は終了後に1回だけ再実行する', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { controller } = setup(async () => {
      calls++;
      if (calls === 1) await gate;
      return OK;
    });
    const first = controller.trigger();
    void controller.trigger();
    void controller.trigger();
    release();
    await first;
    expect(calls).toBe(2);
  });

  it('通信失敗は offline、サーバー失敗は error。間隔を延ばして再試行する', async () => {
    const errors = [new SyncNetworkError('x'), new SyncServerError('y', 500), new SyncNetworkError('z')];
    let i = 0;
    const { controller, events, timers } = setup(async () => {
      if (i < errors.length) throw errors[i++];
      return OK;
    });
    const fire = async () => {
      timers.at(-1)!.fn(); // 再試行タイマーの発火
      await new Promise((r) => setTimeout(r, 0));
    };
    await controller.trigger();
    expect(events.at(-1)).toEqual({ status: 'offline', retryInMs: 10 });
    await fire();
    expect(events.at(-1)).toEqual({ status: 'error', retryInMs: 20 });
    await fire();
    expect(events.at(-1)).toEqual({ status: 'offline', retryInMs: 40 });
    await fire();
    expect(events.at(-1)?.status).toBe('idle');
  });

  it('認証エラーは再試行しない(再ログインが必要)', async () => {
    const { controller, events, timers } = setup(async () => {
      throw new SyncAuthError('401');
    });
    await controller.trigger();
    expect(events.at(-1)).toEqual({ status: 'auth-error', retryInMs: null });
    expect(timers).toHaveLength(0);
  });

  it('アプリ更新が必要な場合は専用の状態になり、タイマーで再試行しない', async () => {
    const { controller, events, timers } = setup(async () => {
      throw new SyncUpdateRequiredError(['future']);
    });
    await controller.trigger();
    expect(events.at(-1)).toEqual({ status: 'update-required', retryInMs: null });
    expect(timers).toHaveLength(0);
  });

  it('停止後は実行も再試行もしない', async () => {
    const run = jest.fn(async () => {
      throw new SyncNetworkError('x');
    });
    const { controller, timers } = setup(run);
    await controller.trigger();
    controller.stop();
    expect(timers.every((t) => t.ms === -1)).toBe(true);
    await controller.trigger();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('アカウント切替による停止はエラー表示にしない', async () => {
    const { controller, events, timers } = setup(async () => {
      throw new SyncStoppedError('stop');
    });
    await controller.trigger();
    expect(events.map((e) => e.status)).toEqual(['syncing']);
    expect(timers).toHaveLength(0);
  });
});
