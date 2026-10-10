import { sql } from 'drizzle-orm';

import type { AppDatabase } from '@/db/types';

import {
  applyRemote,
  clearOutbox,
  enableSync,
  getBaseSeq,
  getMeta,
  hasNewerOutbox,
  keyOf,
  META,
  pendingKeys,
  readPending,
  readRecord,
  setBaseSeq,
  setMeta,
  specOf,
  type PendingGroup,
  type RecordData,
} from './local-store';

export type PushChange = {
  entity: string;
  id: string;
  opId: string;
  baseSeq: number | null;
  data: RecordData;
};

export type PushResult = {
  entity: string;
  id: string;
  status: 'applied' | 'noop' | 'superseded' | 'retry';
  serverSeq: number | null;
  conflict: boolean;
  current?: RecordData;
};

export type PullRecord = { entity: string; id: string; serverSeq: number; data: RecordData };

export type SyncTransport = {
  push(changes: PushChange[]): Promise<{ userId: string; results: PushResult[] }>;
  pull(
    cursor: number,
    limit: number,
  ): Promise<{
    userId: string;
    changes: PullRecord[];
    nextCursor: number;
    hasMore: boolean;
  }>;
};

export type SyncSummary = {
  pushed: number;
  pulled: number;
  /** 同時編集が検出され、内容を競合コピーなどで保全した件数 */
  conflicts: number;
};

/** 同期を続けてはいけない状態(ログアウト・アカウント切替・別アカウントの応答) */
export class SyncStoppedError extends Error {}

/**
 * サーバーから、このアプリが理解できない種別(entity)の変更が届いた。
 * 取得済みとして扱うとカーソルが進み、アプリ更新後も再取得できなくなるため、ページ全体を反映せず止める。
 * 自動では再試行しない(アプリを更新するまで解消しない)。ローカルのデータと未送信の変更は失われない。
 */
export class SyncUpdateRequiredError extends Error {
  constructor(readonly entities: string[]) {
    super('このアプリでは扱えない種類のデータがあります。アプリを更新してください');
  }
}

export type RunSyncOptions = {
  db: AppDatabase;
  transport: SyncTransport;
  /** このDBの持ち主(認証済みセッションのユーザーID) */
  userId: string;
  now: () => number;
  newId: () => string;
  /** false になったら、以降のネットワーク通信と反映を行わず止める */
  isActive: () => boolean;
  pushBatchSize?: number;
  pullLimit?: number;
};

const PUSH_BATCH = 50;
const PULL_LIMIT = 100;
/** 無限ループ防止(1回の同期で処理するページ数の上限。残りは次回に続きから) */
const MAX_PAGES = 200;

function checkActive(opts: RunSyncOptions) {
  if (!opts.isActive()) throw new SyncStoppedError('同期は停止されました');
}

function checkUser(opts: RunSyncOptions, responseUserId: string) {
  // 別アカウントのセッションで応答が返った場合は、何も反映せず止める
  if (responseUserId !== opts.userId) throw new SyncStoppedError('アカウントが一致しません');
}

/** サーバーの変更をローカルに反映する間だけ変更検知を止め、反映が再送されないようにする */
function withoutCapture<T>(
  db: AppDatabase,
  now: number,
  body: (tx: Parameters<Parameters<AppDatabase['transaction']>[0]>[0]) => T,
): T {
  // 親子の到着順に依存しないよう、反映の間だけ外部キー検査を止める(トランザクション外で切り替える)
  db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    return db.transaction((tx) => {
      setMeta(tx, META.capture, '0', now);
      const result = body(tx);
      setMeta(tx, META.capture, '1', now);
      return result;
    });
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`);
  }
}

async function pushAll(opts: RunSyncOptions, deviceId: string, summary: SyncSummary): Promise<void> {
  const { db } = opts;
  for (let page = 0; page < MAX_PAGES; page++) {
    checkActive(opts);
    const groups = readPending(db, opts.pushBatchSize ?? PUSH_BATCH);
    if (groups.length === 0) return;

    const sent = new Map<string, PendingGroup>();
    const changes: PushChange[] = [];
    for (const g of groups) {
      const spec = specOf(g.entity);
      const data = spec ? readRecord(db, spec, g.entityId) : undefined;
      if (!spec || !data) {
        // 対応しない種別、または行が存在しない: 送るものがないので登録だけ外す
        clearOutbox(db, g.entity, g.entityId, g.maxSeq);
        continue;
      }
      sent.set(keyOf(g.entity, g.entityId), g);
      changes.push({
        entity: g.entity,
        id: g.entityId,
        // 同じ内容の再送は同じ操作ID、編集後は新しい操作ID(outbox の seq は再利用されない)
        opId: `${deviceId}-${g.maxSeq}`,
        baseSeq: getBaseSeq(db, g.entity, g.entityId),
        data,
      });
    }
    if (changes.length === 0) continue;

    const response = await opts.transport.push(changes);
    checkActive(opts);
    checkUser(opts, response.userId);

    let progressed = 0;
    // 応答を反映する間は変更検知を止める(サーバー側の内容の取り込みが再送されないように)
    withoutCapture(db, opts.now(), (tx) => {
      for (const r of response.results) {
        const g = sent.get(keyOf(r.entity, r.id));
        const spec = specOf(r.entity);
        if (!g || !spec || r.status === 'retry') continue;
        // 送信後(応答待ちの間)に同じレコードが再編集・削除されているか。送信済みの変更(seq <= maxSeq)とは区別する。
        // 確認から反映・outbox 更新までは、この同じトランザクション内で行う
        const editedSince = hasNewerOutbox(tx, r.entity, r.id, g.maxSeq);
        if (r.status === 'superseded' && r.current && !editedSince) {
          applyRemote(tx, spec, r.id, r.current);
        }
        // 後続の編集がある場合は、サーバーの内容で上書きせず、ベース版も進めない。
        // 次の送信が同時編集として扱われ、サーバー側の削除・他端末の編集との競合で内容が競合コピーに保全される
        if (r.serverSeq !== null && !(r.status === 'superseded' && editedSince)) {
          setBaseSeq(tx, r.entity, r.id, r.serverSeq);
        }
        // 反映が確認できた分だけを outbox から外す(これ以降の編集は残る)
        clearOutbox(tx, r.entity, r.id, g.maxSeq);
        progressed++;
        summary.pushed++;
        if (r.conflict) summary.conflicts++;
      }
    });
    // サーバー側で同時に更新されて反映されなかった(retry)だけなら、今回は打ち切って次回に再送する
    if (progressed === 0) return;
  }
}

async function pullAll(opts: RunSyncOptions, summary: SyncSummary): Promise<void> {
  const { db } = opts;
  let cursor = Number(getMeta(db, META.cursor) ?? 0);
  for (let page = 0; page < MAX_PAGES; page++) {
    checkActive(opts);
    const response = await opts.transport.pull(cursor, opts.pullLimit ?? PULL_LIMIT);
    checkActive(opts);
    checkUser(opts, response.userId);

    // 未対応の種別を飛ばしてカーソルを進めると、アプリ更新後も再取得できない。何も反映せずカーソルも進めない
    const unknown = [...new Set(response.changes.filter((c) => !specOf(c.entity)).map((c) => c.entity))];
    if (unknown.length > 0) throw new SyncUpdateRequiredError(unknown);

    // ページの反映とカーソルの更新は同じトランザクション。途中で中断してもカーソルは進まず、再取得で冪等に再反映される
    withoutCapture(db, opts.now(), (tx) => {
      // 未送信の編集があるレコードは上書きしない(次の送信で競合として解決され、内容は保全される)
      const pending = pendingKeys(tx);
      for (const rec of response.changes) {
        const spec = specOf(rec.entity);
        if (!spec) throw new SyncUpdateRequiredError([rec.entity]); // 上で検出済み。ロールバックの保険
        if (pending.has(keyOf(rec.entity, rec.id))) continue;
        applyRemote(tx, spec, rec.id, rec.data);
        setBaseSeq(tx, rec.entity, rec.id, rec.serverSeq);
        summary.pulled++;
      }
      setMeta(tx, META.cursor, String(response.nextCursor), opts.now());
    });

    if (!response.hasMore) return;
    if (response.nextCursor <= cursor) return; // 進まないページで無限ループしない
    cursor = response.nextCursor;
  }
}

/**
 * 1回の同期: 未送信の変更を送信 → サーバーの差分を取得。
 * 通信・サーバーのエラーは例外で返し、ローカルのデータと outbox は失われない(次回、続きから再試行)。
 */
export async function runSync(opts: RunSyncOptions): Promise<SyncSummary> {
  const summary: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0 };
  const deviceId = enableSync(opts.db, opts.userId, opts.newId, opts.now());
  await pushAll(opts, deviceId, summary);
  await pullAll(opts, summary);
  setMeta(opts.db, META.lastSyncedAt, String(opts.now()), opts.now());
  return summary;
}
