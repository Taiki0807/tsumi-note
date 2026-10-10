import { CONFLICT_COPY_PREFIX, type EntitySpec } from './entities';
import { PULL_BUDGET_CHARS, type Change, type RecordData, type Value } from './validate';

/**
 * 差分同期のサーバー側ロジック(D1 / テスト用SQLite 共通)。
 *
 * - すべてのSQLは `user_id = ?`(セッション由来)で絞り、レコードはユーザー単位で完全に分離する。
 * - 書き込みは1回の batch(D1 ではトランザクション)で行い、サーバー採番の `server_seq` を
 *   ユーザー単位のカウンタから振る。端末の時計(updated_at)は順序の判断に使わない。
 * - 各書き込みは「読んだときの server_seq」と一致する場合だけ反映する(楽観ロック)。
 *   同時に別端末が更新していたら反映せず `retry` を返し、クライアントが未送信のまま再送する。
 */
export type SqlStatement = { sql: string; params: Value[] };

export interface SyncDriver {
  all<T>(statement: SqlStatement): Promise<T[]>;
  /** 全文を1トランザクションで実行し、各文の変更行数を返す */
  batch(statements: SqlStatement[]): Promise<number[]>;
}

export type PushStatus = 'applied' | 'noop' | 'superseded' | 'retry';

export type PushResult = {
  entity: string;
  id: string;
  status: PushStatus;
  /** サーバー上の現在のバージョン。retry のときは null */
  serverSeq: number | null;
  /** 同時編集が検出され、上書きされる側の内容を保全した(競合コピー、または削除より編集を優先して保全した) */
  conflict: boolean;
  /** superseded のとき、サーバー側の内容(クライアントはこれを採用する) */
  current?: RecordData;
};

type Stored = { data: RecordData; seq: number };

const IN_CHUNK = 40;
const keyOf = (entity: string, id: string) => `${entity}\u0000${id}`;

const isDeleted = (data: RecordData) => data.deleted_at !== null && data.deleted_at !== undefined;

export function sameData(spec: EntitySpec, a: RecordData, b: RecordData): boolean {
  return spec.fields.every((f) => a[f.name] === b[f.name]);
}

/** FSRS状態の全順序: 最後に復習した方 → 復習回数が多い方 → 更新が新しい方。端末時計には依存しない主キーが優先 */
function fsrsRank(d: RecordData): [number, number, number] {
  return [Number(d.last_review ?? -1), Number(d.reps), Number(d.updated_at)];
}

export function fsrsWins(incoming: RecordData, current: RecordData): boolean {
  const a = fsrsRank(incoming);
  const b = fsrsRank(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x !== y) return x > y;
  }
  return false;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 競合コピー。IDは (元ID, 内容) から決まるので、再送しても重複せず、別内容は別コピーになる */
function makeCopy(spec: EntitySpec, id: string, data: RecordData): { id: string; data: RecordData } {
  const field = spec.conflictCopy!.field;
  const title = String(data[field] ?? '');
  const copy: RecordData = {
    ...data,
    [field]: title.startsWith(CONFLICT_COPY_PREFIX) ? title : CONFLICT_COPY_PREFIX + title,
    deleted_at: null,
  };
  if ('pinned' in copy) copy.pinned = 0;
  const hash = fnv1a(JSON.stringify(spec.fields.map((f) => data[f.name])));
  return { id: `${id.slice(0, 80)}~c${hash}`, data: copy };
}

type Decision =
  | {
      write: false;
      status: 'noop' | 'superseded';
      conflict: boolean;
      copy?: { id: string; data: RecordData };
    }
  | { write: true; conflict: boolean; copy?: { id: string; data: RecordData } };

/** 競合解決の本体(純粋関数)。docs/PHASE8_DESIGN.md の「競合解決」と一致させること */
export function decide(c: Change, s: Stored | undefined): Decision {
  const { spec } = c;
  if (!s) return { write: true, conflict: false };
  if (sameData(spec, s.data, c.data)) return { write: false, status: 'noop', conflict: false };

  switch (spec.kind) {
    case 'append':
      // 追記専用: 既にあるIDは再書き込みしない(履歴は不変)
      return { write: false, status: 'noop', conflict: false };
    case 'setting':
      return { write: true, conflict: false };
    case 'fsrs':
      return fsrsWins(c.data, s.data)
        ? { write: true, conflict: false }
        : { write: false, status: 'superseded', conflict: false };
    case 'mutable': {
      // クライアントが最新版を見た上での編集は、そのまま採用する
      if (c.baseSeq === s.seq) return { write: true, conflict: false };
      // ここから先は、別の端末の変更を見ていない(または不明な)編集 = 同時編集
      const copyOf = (id: string, d: RecordData) => (spec.conflictCopy ? makeCopy(spec, id, d) : undefined);
      const sDeleted = isDeleted(s.data);
      const cDeleted = isDeleted(c.data);
      if (sDeleted && cDeleted) return { write: false, status: 'noop', conflict: false };
      if (sDeleted) {
        // 削除済みを編集で復活させない。編集内容は競合コピーとして残す
        return { write: false, status: 'superseded', conflict: true, copy: copyOf(c.id, c.data) };
      }
      // 削除と編集が衝突: 削除を採用し、他端末の編集内容は競合コピーとして残す。編集同士: 後着を採用し、先着を残す
      return { write: true, conflict: true, copy: copyOf(c.id, s.data) };
    }
  }
}

function dataParams(userId: string, entity: string, id: string, data: RecordData): Value[] {
  return [userId, entity, id, JSON.stringify(data), (data.deleted_at as number | null | undefined) ?? null];
}

const BUMP = 'UPDATE sync_counters SET seq = seq + 1 WHERE user_id = ?';
const SEQ = '(SELECT seq FROM sync_counters WHERE user_id = ?)';

async function loadStored(
  driver: SyncDriver,
  userId: string,
  changes: Change[],
): Promise<Map<string, Stored>> {
  const byEntity = new Map<string, string[]>();
  for (const c of changes) byEntity.set(c.spec.name, [...(byEntity.get(c.spec.name) ?? []), c.id]);
  const out = new Map<string, Stored>();
  for (const [entity, ids] of byEntity) {
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const part = ids.slice(i, i + IN_CHUNK);
      const rows = await driver.all<{ id: string; data: string; server_seq: number }>({
        sql: `SELECT id, data, server_seq FROM sync_records WHERE user_id = ? AND entity = ? AND id IN (${part
          .map(() => '?')
          .join(',')})`,
        params: [userId, entity, ...part],
      });
      for (const r of rows) out.set(keyOf(entity, r.id), { data: JSON.parse(r.data), seq: r.server_seq });
    }
  }
  return out;
}

export async function pushChanges(
  driver: SyncDriver,
  userId: string,
  changes: Change[],
): Promise<PushResult[]> {
  if (changes.length === 0) return [];

  // 既に適用済みの操作(応答が失われた再送)は再適用しない
  const knownOps = new Map<string, number>();
  for (let i = 0; i < changes.length; i += IN_CHUNK) {
    const part = changes.slice(i, i + IN_CHUNK);
    const rows = await driver.all<{ op_id: string; server_seq: number }>({
      sql: `SELECT op_id, server_seq FROM sync_ops WHERE user_id = ? AND op_id IN (${part
        .map(() => '?')
        .join(',')})`,
      params: [userId, ...part.map((c) => c.opId)],
    });
    for (const r of rows) knownOps.set(r.op_id, r.server_seq);
  }

  const pending = changes.filter((c) => !knownOps.has(c.opId));
  const stored = await loadStored(driver, userId, pending);

  const statements: SqlStatement[] = [
    { sql: 'INSERT OR IGNORE INTO sync_counters (user_id, seq) VALUES (?, 0)', params: [userId] },
  ];
  type Plan = { change: Change; decision: Decision; writeIndex: number | null };
  const plans: Plan[] = [];

  for (const c of pending) {
    const s = stored.get(keyOf(c.spec.name, c.id));
    const decision = decide(c, s);
    let writeIndex: number | null = null;
    if (decision.copy) {
      statements.push({ sql: BUMP, params: [userId] });
      statements.push({
        sql: `INSERT INTO sync_records (user_id, entity, id, data, deleted_at, server_seq)
              VALUES (?, ?, ?, ?, ?, ${SEQ}) ON CONFLICT (user_id, entity, id) DO NOTHING`,
        params: [...dataParams(userId, c.spec.name, decision.copy.id, decision.copy.data), userId],
      });
    }
    if (decision.write) {
      statements.push({ sql: BUMP, params: [userId] });
      writeIndex = statements.length;
      statements.push({
        sql: `INSERT INTO sync_records (user_id, entity, id, data, deleted_at, server_seq)
              VALUES (?, ?, ?, ?, ?, ${SEQ})
              ON CONFLICT (user_id, entity, id) DO UPDATE SET
                data = excluded.data, deleted_at = excluded.deleted_at, server_seq = excluded.server_seq
              WHERE sync_records.server_seq = ?`,
        // 読んだ時点のバージョンと一致するときだけ反映する(未存在は -1: 同時に作られていたら反映しない)
        params: [...dataParams(userId, c.spec.name, c.id, c.data), userId, s?.seq ?? -1],
      });
      // 直前の書き込みが反映された場合だけ操作IDを記録する
      statements.push({
        sql: `INSERT OR IGNORE INTO sync_ops (user_id, op_id, server_seq)
              SELECT ?, ?, server_seq FROM sync_records
              WHERE user_id = ? AND entity = ? AND id = ? AND changes() > 0`,
        params: [userId, c.opId, userId, c.spec.name, c.id],
      });
    }
    plans.push({ change: c, decision, writeIndex });
  }

  const changed = statements.length > 1 ? await driver.batch(statements) : [];

  // 反映後のバージョンを読み直す
  const written = plans
    .filter((p) => p.writeIndex !== null && (changed[p.writeIndex] ?? 0) > 0)
    .map((p) => p.change);
  const finalSeq = new Map<string, number>();
  if (written.length > 0) {
    const byEntity = new Map<string, string[]>();
    for (const c of written) byEntity.set(c.spec.name, [...(byEntity.get(c.spec.name) ?? []), c.id]);
    for (const [entity, ids] of byEntity) {
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const part = ids.slice(i, i + IN_CHUNK);
        const rows = await driver.all<{ id: string; server_seq: number }>({
          sql: `SELECT id, server_seq FROM sync_records WHERE user_id = ? AND entity = ? AND id IN (${part
            .map(() => '?')
            .join(',')})`,
          params: [userId, entity, ...part],
        });
        for (const r of rows) finalSeq.set(keyOf(entity, r.id), r.server_seq);
      }
    }
  }

  const planByOp = new Map(plans.map((p) => [p.change.opId, p]));
  return changes.map((c): PushResult => {
    const base = { entity: c.spec.name, id: c.id };
    if (knownOps.has(c.opId)) {
      return { ...base, status: 'applied', serverSeq: knownOps.get(c.opId)!, conflict: false };
    }
    const plan = planByOp.get(c.opId)!;
    const s = stored.get(keyOf(c.spec.name, c.id));
    if (plan.decision.write) {
      if (plan.writeIndex === null || changed[plan.writeIndex] === 0) {
        return { ...base, status: 'retry', serverSeq: null, conflict: false };
      }
      return {
        ...base,
        status: 'applied',
        serverSeq: finalSeq.get(keyOf(c.spec.name, c.id)) ?? null,
        conflict: plan.decision.conflict,
      };
    }
    return {
      ...base,
      status: plan.decision.status,
      serverSeq: s?.seq ?? null,
      conflict: plan.decision.conflict,
      ...(plan.decision.status === 'superseded' && s ? { current: s.data } : {}),
    };
  });
}

export type PullRecord = { entity: string; id: string; serverSeq: number; data: RecordData };

export async function pullChanges(
  driver: SyncDriver,
  userId: string,
  cursor: number,
  limit: number,
): Promise<{ changes: PullRecord[]; nextCursor: number; hasMore: boolean }> {
  const rows = await driver.all<{ entity: string; id: string; data: string; server_seq: number }>({
    sql: `SELECT entity, id, data, server_seq FROM sync_records
          WHERE user_id = ? AND server_seq > ? ORDER BY server_seq ASC LIMIT ?`,
    params: [userId, cursor, limit + 1],
  });
  const changes: PullRecord[] = [];
  let size = 0;
  let hasMore = rows.length > limit;
  for (const r of rows.slice(0, limit)) {
    size += r.data.length;
    if (changes.length > 0 && size > PULL_BUDGET_CHARS) {
      hasMore = true;
      break;
    }
    changes.push({ entity: r.entity, id: r.id, serverSeq: r.server_seq, data: JSON.parse(r.data) });
  }
  // カーソルは返した最後のレコードまで。それ以降は次ページで必ず取得される
  const nextCursor = changes.at(-1)?.serverSeq ?? cursor;
  return { changes, nextCursor, hasMore };
}
