import { sql, type SQL } from 'drizzle-orm';

import type { AppDatabase } from '@/db/types';

import { ENTITIES, ENTITY_BY_NAME, type EntitySpec } from './entities';
import { fsrsWins } from './merge';

/** `db` / transaction のどちらも渡せる最小の型 */
export type Executor = Pick<AppDatabase, 'run' | 'all'>;

export type RecordData = Record<string, string | number | null>;

const ident = (name: string) => sql.identifier(name);
const list = (parts: (SQL | ReturnType<typeof sql.identifier>)[]) => sql.join(parts, sql`, `);

export const META = {
  capture: 'sync.capture',
  seeded: 'sync.seeded',
  owner: 'sync.owner',
  cursor: 'sync.cursor',
  deviceId: 'sync.deviceId',
  lastSyncedAt: 'sync.lastSyncedAt',
} as const;

export class OwnerMismatchError extends Error {
  constructor() {
    super('このデータベースは別のアカウントの同期状態を持っています');
  }
}

export function getMeta(db: Executor, key: string): string | undefined {
  const rows = db.all<{ value: string }>(sql`SELECT value FROM sync_metadata WHERE key = ${key}`);
  return rows[0]?.value;
}

export function setMeta(db: Executor, key: string, value: string, now: number): void {
  db.run(
    sql`INSERT INTO sync_metadata (key, value, updated_at) VALUES (${key}, ${value}, ${now})
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
}

/** 同期対象の設定キー(drizzle/0004 のトリガーと同じ条件) */
const SETTING_FILTER = sql`(key LIKE 'review.%' OR key IN ('timer.focusMinutes', 'timer.breakMinutes', 'timer.rounds', 'appearance.darkMode'))`;

/**
 * このアカウントDBの同期を有効にする(1トランザクション)。
 * - DBの持ち主が別アカウントなら例外(アカウントのデータを混ぜない)。
 * - 初回のみ、既存の全レコードを outbox に登録する(ゲストから引き継いだデータ・移行前のデータを含む)。
 * - 以後の変更は DB トリガーが outbox に登録する。既存データは変更しない。
 */
export function enableSync(db: AppDatabase, ownerId: string, newId: () => string, now: number): string {
  return db.transaction((tx) => {
    const owner = getMeta(tx, META.owner);
    if (owner !== undefined && owner !== ownerId) throw new OwnerMismatchError();
    if (owner === undefined) setMeta(tx, META.owner, ownerId, now);

    let deviceId = getMeta(tx, META.deviceId);
    if (deviceId === undefined) {
      deviceId = newId();
      setMeta(tx, META.deviceId, deviceId, now);
    }

    if (getMeta(tx, META.seeded) !== '1') {
      for (const spec of ENTITIES) {
        const where = spec.kind === 'setting' ? sql` WHERE ${SETTING_FILTER}` : sql``;
        tx.run(
          sql`INSERT INTO sync_outbox (entity, entity_id, created_at)
              SELECT ${spec.name}, ${ident(spec.idColumn)}, ${now} FROM ${ident(spec.table)}${where}`,
        );
      }
      setMeta(tx, META.seeded, '1', now);
    }
    setMeta(tx, META.capture, '1', now);
    return deviceId;
  });
}

export type PendingGroup = { entity: string; entityId: string; maxSeq: number };

const rankCase = sql.join(
  [sql`CASE entity`, ...ENTITIES.map((e) => sql` WHEN ${e.name} THEN ${e.rank}`), sql` ELSE 99 END`],
  sql``,
);

/** 未送信の変更(同じレコードは1件にまとめる)。親 → 子の順 */
export function readPending(db: Executor, limit: number): PendingGroup[] {
  return db
    .all<{ entity: string; entity_id: string; max_seq: number }>(
      sql`SELECT entity, entity_id, MAX(seq) AS max_seq FROM sync_outbox
          GROUP BY entity, entity_id ORDER BY ${rankCase}, max_seq LIMIT ${limit}`,
    )
    .map((r) => ({ entity: r.entity, entityId: r.entity_id, maxSeq: r.max_seq }));
}

export function countPending(db: Executor): number {
  return (
    db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM (SELECT 1 FROM sync_outbox GROUP BY entity, entity_id)`,
    )[0]?.n ?? 0
  );
}

export function pendingKeys(db: Executor): Set<string> {
  const rows = db.all<{ entity: string; entity_id: string }>(
    sql`SELECT DISTINCT entity, entity_id FROM sync_outbox`,
  );
  return new Set(rows.map((r) => keyOf(r.entity, r.entity_id)));
}

export const keyOf = (entity: string, id: string) => `${entity}\u0000${id}`;

/** 送信済みと確認できた分だけを outbox から消す(それ以降の編集は残る) */
export function clearOutbox(db: Executor, entity: string, entityId: string, upToSeq: number): void {
  db.run(
    sql`DELETE FROM sync_outbox WHERE entity = ${entity} AND entity_id = ${entityId} AND seq <= ${upToSeq}`,
  );
}

/** 指定の seq より後に、同じレコードの変更が登録されているか(送信後に追加された編集・削除) */
export function hasNewerOutbox(db: Executor, entity: string, entityId: string, afterSeq: number): boolean {
  const n = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM sync_outbox WHERE entity = ${entity} AND entity_id = ${entityId} AND seq > ${afterSeq}`,
  )[0]?.n;
  return (n ?? 0) > 0;
}

export function readRecord(db: Executor, spec: EntitySpec, id: string): RecordData | undefined {
  const cols = spec.fields.map((f) => ident(f.name));
  const rows = db.all<RecordData>(
    sql`SELECT ${list(cols)} FROM ${ident(spec.table)} WHERE ${ident(spec.idColumn)} = ${id}`,
  );
  return rows[0];
}

export function getBaseSeq(db: Executor, entity: string, id: string): number | null {
  const rows = db.all<{ server_seq: number }>(
    sql`SELECT server_seq FROM sync_record_meta WHERE entity = ${entity} AND entity_id = ${id}`,
  );
  return rows[0]?.server_seq ?? null;
}

export function setBaseSeq(db: Executor, entity: string, id: string, seq: number): void {
  db.run(
    sql`INSERT INTO sync_record_meta (entity, entity_id, server_seq) VALUES (${entity}, ${id}, ${seq})
        ON CONFLICT (entity, entity_id) DO UPDATE SET server_seq = excluded.server_seq`,
  );
}

/**
 * サーバーの内容をローカルへ反映する(呼び出し側が capture を止めたトランザクション内で呼ぶ)。
 * - mutable / setting: サーバーの内容で置き換える
 * - append: 既にあれば何もしない(履歴は不変)
 * - fsrs: ローカルより新しい復習状態のときだけ置き換える
 * 戻り値は反映したか。
 */
export function applyRemote(db: Executor, spec: EntitySpec, id: string, data: RecordData): boolean {
  if (spec.kind === 'fsrs') {
    const local = readRecord(db, spec, id);
    if (local && !fsrsWins(data as never, local as never)) return false;
  }
  const names = [spec.idColumn, ...spec.fields.map((f) => f.name)];
  const values = [id, ...spec.fields.map((f) => data[f.name] ?? null)];
  const cols = list(names.map(ident));
  const vals = list(values.map((v) => sql`${v}`));
  if (spec.kind === 'append') {
    db.run(sql`INSERT OR IGNORE INTO ${ident(spec.table)} (${cols}) VALUES (${vals})`);
    return true;
  }
  const updates = list(spec.fields.map((f) => sql`${ident(f.name)} = excluded.${ident(f.name)}`));
  db.run(
    sql`INSERT INTO ${ident(spec.table)} (${cols}) VALUES (${vals})
        ON CONFLICT (${ident(spec.idColumn)}) DO UPDATE SET ${updates}`,
  );
  return true;
}

export const specOf = (entity: string): EntitySpec | undefined => ENTITY_BY_NAME.get(entity);
