import { SyncStoppedError, SyncUpdateRequiredError, type SyncSummary } from './engine';
import { SyncAuthError, SyncNetworkError } from './http-transport';

export type SyncStatus =
  /** 同期しない(ゲスト、またはAPI未設定) */
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  /** 再ログインが必要。ローカルのデータは保持される */
  | 'auth-error'
  /** アプリの更新が必要(未対応のデータ種別がある)。ローカルのデータは保持される */
  | 'update-required';

export type ControllerEvent =
  | { status: 'syncing' }
  | { status: 'idle'; summary: SyncSummary }
  | { status: 'offline' | 'error' | 'auth-error' | 'update-required' | 'disabled'; retryInMs: number | null };

type Options = {
  run: () => Promise<SyncSummary>;
  onChange: (event: ControllerEvent) => void;
  /** 失敗後の再試行間隔(ミリ秒)。最後の値を繰り返す */
  backoffMs?: number[];
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export const DEFAULT_BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];

/**
 * 同期の実行制御: 同時に1つだけ実行し、実行中の要求は終了後に1回だけまとめて再実行する。
 * 通信・サーバーの失敗は指数的に間隔を延ばして再試行し、認証エラーとアカウント切替では止まる
 * (認証エラーは再ログインするまで再試行しない)。
 */
export function createSyncController(options: Options) {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let stopped = false;
  /** アプリ更新が必要な間は true。この controller(=この実行環境)の間は解消しない */
  let updateRequired = false;
  let running: Promise<void> | null = null;
  let rerun = false;
  let failures = 0;
  let timer: unknown = null;

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  async function execute(): Promise<void> {
    options.onChange({ status: 'syncing' });
    try {
      const summary = await options.run();
      failures = 0;
      if (!stopped) options.onChange({ status: 'idle', summary });
    } catch (e) {
      if (stopped || e instanceof SyncStoppedError) return;
      if (e instanceof SyncAuthError) {
        options.onChange({ status: 'auth-error', retryInMs: null });
        return;
      }
      if (e instanceof SyncUpdateRequiredError) {
        // 更新するまで解消しないので、以降の trigger()(定期・復帰・ネットワーク・手動)も受け付けない。
        // アプリ更新後は新しい実行環境で controller が作り直され、保存済みカーソルから再開する
        updateRequired = true;
        cancelTimer();
        options.onChange({ status: 'update-required', retryInMs: null });
        return;
      }
      const retryInMs = backoff[Math.min(failures, backoff.length - 1)] ?? 300_000;
      failures++;
      options.onChange({ status: e instanceof SyncNetworkError ? 'offline' : 'error', retryInMs });
      timer = setTimer(() => {
        timer = null;
        void trigger();
      }, retryInMs);
    }
  }

  function trigger(): Promise<void> {
    if (stopped || updateRequired) return Promise.resolve();
    if (running) {
      rerun = true;
      return running;
    }
    cancelTimer();
    running = (async () => {
      try {
        do {
          rerun = false;
          await execute();
        } while (rerun && !stopped && !updateRequired);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    trigger,
    /** ログアウト・アカウント切替・画面の破棄。以降は通信も再試行も行わない */
    stop() {
      stopped = true;
      cancelTimer();
    },
    /** アプリ更新が必要で、自動同期を止めている */
    get isUpdateRequired() {
      return updateRequired;
    },
    get isRunning() {
      return running !== null;
    },
  };
}
