import { randomUUID } from 'expo-crypto';
import * as Network from 'expo-network';
import { addDatabaseChangeListener } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useDatabaseContext } from '@/db/database-provider';
import { databaseNameForOwner, imageDirectoryForOwner } from '@/db/ownership';
import { authClient } from '@/features/auth/auth-client';
import { useAuth } from '@/features/auth/auth-context';
import { readAuthConfig } from '@/features/auth/config';
import { createNoteImageBlobs, sha256Hex } from '@/features/notes/note-image-store';

import { createSyncController, type SyncStatus } from './controller';
import { runSync, SyncStoppedError } from './engine';
import { ENTITIES } from './entities';
import { createHttpImageTransport } from './http-image-transport';
import { createHttpTransport, SyncAuthError } from './http-transport';
import { liveNoteBodies, pullImages, pushImages, type ImageSyncOptions } from './image-sync';
import { countPending, getMeta, META } from './local-store';

export type SyncState = {
  status: SyncStatus;
  /** 最後に同期が完了した時刻(epoch ms)。未同期なら null */
  lastSyncedAt: number | null;
  /** 未送信の変更があるレコード数(ローカルには保存済み) */
  pending: number;
  /** 直近の同期で内容を保全した競合の件数 */
  conflicts: number;
  syncNow: () => void;
};

const DISABLED: SyncState = {
  status: 'disabled',
  lastSyncedAt: null,
  pending: 0,
  conflicts: 0,
  syncNow: () => {},
};
const SyncContext = createContext<SyncState>(DISABLED);

export function useSync(): SyncState {
  return useContext(SyncContext);
}

const ENTITY_TABLES = new Set(ENTITIES.map((e) => e.table));
const PERIODIC_MS = 5 * 60_000;
const DEBOUNCE_MS = 3_000;

/**
 * ログイン中のアカウントDBだけを同期する。ゲストDBは同期しない。
 * データベースの切替で子ごと再マウントされる(DatabaseProvider)ので、アカウントを切り替えると
 * このコンポーネントも破棄され、前アカウントの同期は止まる。
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { db, owner, databaseName } = useDatabaseContext();
  const { state } = useAuth();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  // 認証状態の復元前(ヒントだけで開いたDB)や、DBと別のユーザーでは同期しない
  const enabled =
    authClient !== null && owner !== null && userId !== null && databaseNameForOwner(userId) === databaseName;

  const [value, setValue] = useState<Omit<SyncState, 'syncNow'>>({
    status: 'disabled',
    lastSyncedAt: null,
    pending: 0,
    conflicts: 0,
  });
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled || !authClient || !userId) return;
    const client = authClient;
    const apiUrl = readAuthConfig().apiUrl;
    if (!apiUrl) return;
    let active = true;
    const transport = createHttpTransport({ baseUrl: apiUrl, getCookie: () => client.getCookie() });

    const readLast = () => {
      const raw = getMeta(db, META.lastSyncedAt);
      return raw ? Number(raw) : null;
    };
    const refresh = (patch: Partial<Omit<SyncState, 'syncNow'>>) =>
      active && setValue((v) => ({ ...v, lastSyncedAt: readLast(), pending: countPending(db), ...patch }));

    // 自動同期の経路(定期・フォアグラウンド復帰・ネットワーク復帰)。更新が必要になったら全て外す
    let interval: ReturnType<typeof setInterval> | null = null;
    let appState: { remove: () => void } | null = null;
    let net: { remove: () => void } | null = null;
    const stopAutoTriggers = () => {
      if (interval) clearInterval(interval);
      interval = null;
      appState?.remove();
      appState = null;
      net?.remove();
      net = null;
    };

    // 画像: 端末のファイル → R2。D1の同期とは別に、ファイルごとの転送状態で管理する。
    // DB・画像ディレクトリ・認証Cookieは同期開始時の所有者に固定する(アカウント切替で現在値を参照しない)
    const aborter = new AbortController();
    const pinnedCookie = Promise.resolve(client.getCookie());
    const imageOptions: ImageSyncOptions = {
      db,
      files: createNoteImageBlobs(imageDirectoryForOwner(owner)),
      transport: createHttpImageTransport({
        baseUrl: apiUrl,
        getCookie: () => pinnedCookie,
        signal: aborter.signal,
      }),
      liveBodies: () => liveNoteBodies(db),
      sha256: sha256Hex,
      now: Date.now,
      isActive: () => active,
    };
    /** 画像の失敗(通信・サーバー)でD1の同期を止めない。再ログインとアカウント切替だけは伝える */
    const imagePhase = async (phase: typeof pushImages) => {
      try {
        await phase(imageOptions);
      } catch (e) {
        if (e instanceof SyncAuthError || e instanceof SyncStoppedError) throw e;
      }
    };

    const controller = createSyncController({
      run: async () => {
        await imagePhase(pushImages); // ノートの参照より先に、画像の本体をR2へ
        const summary = await runSync({
          db,
          transport,
          userId,
          now: Date.now,
          newId: randomUUID,
          isActive: () => active,
        });
        await imagePhase(pullImages); // 反映されたノートが参照する画像を取得
        return summary;
      },
      onChange: (event) => {
        if (!active) return;
        if (event.status === 'syncing') refresh({ status: 'syncing' });
        else if (event.status === 'idle') refresh({ status: 'idle', conflicts: event.summary.conflicts });
        else {
          if (event.status === 'update-required') stopAutoTriggers();
          refresh({ status: event.status });
        }
      },
    });
    const trigger = () => void controller.trigger();
    triggerRef.current = trigger;
    refresh({ status: 'idle' });
    trigger();

    let debounce: ReturnType<typeof setTimeout> | null = null;
    // 変更が入ったら(未送信があれば)少し待ってまとめて送る。同期自身の書き込みでは再実行しない
    const dbListener = addDatabaseChangeListener((e) => {
      if (!ENTITY_TABLES.has(e.tableName) || controller.isRunning) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (countPending(db) > 0) trigger();
        else refresh({});
      }, DEBOUNCE_MS);
    });
    appState = AppState.addEventListener('change', (s) => s === 'active' && trigger());
    net = Network.addNetworkStateListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) trigger();
    });
    interval = setInterval(trigger, PERIODIC_MS);

    return () => {
      active = false;
      aborter.abort(); // 進行中の画像通信を中断。完了後の書き込みは isActive で防ぐ
      controller.stop();
      if (debounce) clearTimeout(debounce);
      stopAutoTriggers();
      dbListener.remove();
      triggerRef.current = () => {};
    };
  }, [enabled, db, userId, owner]);

  const syncNow = useCallback(() => triggerRef.current(), []);
  // 同期しない間(ゲスト・セッション復元中)は無効状態を返す。前回の値は引き継がない
  const ctx = useMemo<SyncState>(
    () => (enabled ? { ...value, syncNow } : DISABLED),
    [enabled, value, syncNow],
  );
  return <SyncContext.Provider value={ctx}>{children}</SyncContext.Provider>;
}
