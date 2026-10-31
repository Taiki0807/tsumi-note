import { ENTITY_BY_NAME } from '../sync/entities';
import { pushChanges, type SqlStatement, type SyncDriver } from '../sync/service';
import type { Change } from '../sync/validate';

/**
 * 外部サービス連携API(v1.1.0)。
 *
 * - 認証は個人APIトークン(`Authorization: Bearer tsn_...`)。トークンはSHA-256ハッシュだけを保存し、作成時に一度だけ表示する。
 * - トークンの権限(scope)は「学習記録の登録(study_sessions:write)」と「学習記録の読み取り(study_sessions:read)」だけ。
 *   アカウント操作・同期・他のエンティティには使えない。権限のないAPIは 403 insufficient_scope。
 * - 有効期限を設定でき、期限切れは失効と同じく 401 になる。
 * - 書き込み先のユーザーは常にトークンの持ち主(本文・クエリのユーザーIDは存在しない)。
 * - 登録した学習記録は通常の同期レコード(study_sessions)になり、アプリは次回の同期で受け取る。
 */
export const TOKEN_PREFIX = 'tsn_';
export const MAX_ACTIVE_TOKENS = 5;
export const MAX_TOKEN_NAME = 50;
export const SCOPES = ['study_sessions:write', 'study_sessions:read'] as const;
export type Scope = (typeof SCOPES)[number];
/** scopes 未指定の発行・列追加前の既存トークンは、従来どおり登録専用 */
export const DEFAULT_SCOPES: Scope[] = ['study_sessions:write'];
export const MAX_EXPIRES_IN_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_READ_LIMIT = 100;
export const MAX_SUMMARY_DAYS = 92;
/** 1トークンあたりの登録回数の上限 */
export const EXTERNAL_RATE_MAX = 60;
export const EXTERNAL_RATE_WINDOW_MS = 60 * 1000;
export const MAX_SESSION_SECONDS = 24 * 60 * 60;
/** 端末と外部サービスの時計ずれを許容する未来側の余白 */
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const EARLIEST = Date.UTC(2000, 0, 1);

export class ExternalError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type TokenInfo = {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  scopes: Scope[];
  /** 有効期限(ms)。null は無期限 */
  expiresAt: number | null;
};

function parseScopes(raw: string): Scope[] {
  return raw.split(',').filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
}

export async function listTokens(driver: SyncDriver, userId: string): Promise<TokenInfo[]> {
  const rows = await driver.all<{
    id: string;
    name: string;
    token_prefix: string;
    created_at: number;
    last_used_at: number | null;
    scopes: string;
    expires_at: number | null;
  }>({
    sql: `SELECT id, name, token_prefix, created_at, last_used_at, scopes, expires_at FROM api_tokens
          WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at`,
    params: [userId],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.token_prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    scopes: parseScopes(r.scopes),
    expiresAt: r.expires_at,
  }));
}

export type TokenOptions = { scopes?: unknown; expiresInDays?: unknown };

function parseTokenOptions(opts: TokenOptions, now: number): { scopes: Scope[]; expiresAt: number | null } {
  let scopes = DEFAULT_SCOPES;
  if (opts.scopes !== undefined) {
    const list = opts.scopes;
    if (
      !Array.isArray(list) ||
      list.length === 0 ||
      !list.every((s) => typeof s === 'string' && (SCOPES as readonly string[]).includes(s))
    ) {
      throw new ExternalError(
        'invalid_scopes',
        400,
        `scopes は ${SCOPES.join(' / ')} から1つ以上指定してください`,
      );
    }
    scopes = SCOPES.filter((s) => list.includes(s));
  }
  let expiresAt: number | null = null;
  const days = opts.expiresInDays;
  if (days !== undefined && days !== null) {
    if (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 1 || days > MAX_EXPIRES_IN_DAYS) {
      throw new ExternalError(
        'invalid_expiry',
        400,
        `expiresInDays は 1〜${MAX_EXPIRES_IN_DAYS} の整数か null(無期限)にしてください`,
      );
    }
    expiresAt = now + days * DAY_MS;
  }
  return { scopes, expiresAt };
}

/** 新しいトークンを発行する。返す `token` は平文で、この呼び出しでしか得られない */
export async function createToken(
  driver: SyncDriver,
  userId: string,
  rawName: unknown,
  now: number,
  opts: TokenOptions = {},
): Promise<TokenInfo & { token: string }> {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name.length === 0 || name.length > MAX_TOKEN_NAME) {
    throw new ExternalError('invalid_name', 400, `名前は1〜${MAX_TOKEN_NAME}文字で入力してください`);
  }
  const { scopes, expiresAt } = parseTokenOptions(opts, now);
  // 期限切れのキーも一覧に残り枠を使う(画面から失効して整理する)
  if ((await listTokens(driver, userId)).length >= MAX_ACTIVE_TOKENS) {
    throw new ExternalError('too_many_tokens', 409, `トークンは${MAX_ACTIVE_TOKENS}個までです`);
  }
  const token = TOKEN_PREFIX + base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = crypto.randomUUID();
  const prefix = token.slice(0, TOKEN_PREFIX.length + 6);
  await driver.batch([
    {
      sql: `INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix, created_at, scopes, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, userId, name, await sha256Hex(token), prefix, now, scopes.join(','), expiresAt],
    },
  ]);
  return { id, name, prefix, createdAt: now, lastUsedAt: null, scopes, expiresAt, token };
}

/** 自分のトークンだけを失効する。他人のID・存在しないIDは区別なく false */
export async function revokeToken(
  driver: SyncDriver,
  userId: string,
  tokenId: string,
  now: number,
): Promise<boolean> {
  const [changed] = await driver.batch([
    {
      sql: 'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
      params: [now, tokenId, userId],
    },
  ]);
  return (changed ?? 0) > 0;
}

/** `Authorization` ヘッダーからトークンの持ち主を解決する。無効・失効・削除依頼済みは区別なく null */
export async function authenticateToken(
  driver: SyncDriver,
  authorization: string | undefined,
  now: number,
): Promise<{ userId: string; tokenId: string; scopes: Scope[] } | null> {
  const match = /^Bearer (tsn_[A-Za-z0-9_-]{20,100})$/.exec(authorization ?? '');
  if (!match) return null;
  const rows = await driver.all<{ id: string; user_id: string; scopes: string }>({
    sql: `SELECT t.id, t.user_id, t.scopes FROM api_tokens t JOIN user u ON u.id = t.user_id
          WHERE t.token_hash = ? AND t.revoked_at IS NULL AND u.email_verified = 1
            AND (t.expires_at IS NULL OR t.expires_at > ?)
            AND NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id = t.user_id)`,
    params: [await sha256Hex(match[1]!), now],
  });
  const row = rows[0];
  if (!row) return null;
  // 最終利用時刻は目安。失敗しても認証は成功させる
  await driver
    .batch([{ sql: 'UPDATE api_tokens SET last_used_at = ? WHERE id = ?', params: [now, row.id] }])
    .catch(() => undefined);
  return { userId: row.user_id, tokenId: row.id, scopes: parseScopes(row.scopes) };
}

/** トークン単位のレート制限(既存の rate_limit テーブルを使う)。超過なら false */
export async function consumeExternalRate(
  driver: SyncDriver,
  tokenId: string,
  now: number,
): Promise<boolean> {
  const key = `external:${tokenId}`;
  const rows = await driver.all<{ count: number; last_request: number }>({
    sql: 'SELECT count, last_request FROM rate_limit WHERE key = ?',
    params: [key],
  });
  const row = rows[0];
  const statements: SqlStatement[] = [];
  if (!row || now - row.last_request > EXTERNAL_RATE_WINDOW_MS) {
    statements.push({
      sql: 'INSERT INTO rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, last_request = excluded.last_request',
      params: [key, key, now],
    });
  } else {
    if (row.count >= EXTERNAL_RATE_MAX) return false;
    statements.push({ sql: 'UPDATE rate_limit SET count = count + 1 WHERE key = ?', params: [key] });
  }
  await driver.batch(statements);
  return true;
}

export type ExternalSessionInput = {
  externalId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  folderId: string | null;
  /** 正規化済み(trim + NFC)のフォルダー名。folderId とは同時に指定できない */
  folderName: string | null;
};

export const MAX_FOLDER_NAME = 50;
export const MIN_SESSION_SECONDS = 60;

export const normalizeFolderName = (name: string) => name.trim().normalize('NFC');

function parseTime(raw: unknown, field: string): number {
  // タイムゾーン付きのISO 8601(例: 2026-10-28T09:00:00+09:00 / ...Z)のみ受け付ける。ずれた解釈を避けるため
  if (
    typeof raw !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)
  ) {
    throw new ExternalError(
      'invalid_request',
      400,
      `${field} はタイムゾーン付きのISO 8601で指定してください`,
    );
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new ExternalError('invalid_request', 400, `${field} が不正です`);
  return Math.floor(ms / 1000) * 1000; // アプリのデータと同じく秒単位に揃える
}

/** 学習記録の登録リクエストを検証する(未知のキーは拒否) */
export function parseExternalSession(body: unknown, now: number): ExternalSessionInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ExternalError('invalid_request', 400, '本文はJSONオブジェクトで指定してください');
  }
  const b = body as Record<string, unknown>;
  const allowed = new Set(['externalId', 'startedAt', 'endedAt', 'durationSeconds', 'folderId', 'folderName']);
  for (const key of Object.keys(b)) {
    if (!allowed.has(key)) throw new ExternalError('invalid_request', 400, `未知のキー: ${key}`);
  }
  if (typeof b.externalId !== 'string' || !/^[A-Za-z0-9._~:-]{1,64}$/.test(b.externalId)) {
    throw new ExternalError('invalid_request', 400, 'externalId は英数字と . _ ~ : - の1〜64文字です');
  }
  const startedAt = parseTime(b.startedAt, 'startedAt');
  const endedAt = parseTime(b.endedAt, 'endedAt');
  if (startedAt < EARLIEST) throw new ExternalError('invalid_request', 400, 'startedAt が古すぎます');
  if (endedAt <= startedAt) {
    throw new ExternalError('invalid_request', 400, 'endedAt は startedAt より後にしてください');
  }
  if (endedAt > now + FUTURE_SKEW_MS) {
    throw new ExternalError('invalid_request', 400, '未来の時刻は登録できません');
  }
  const span = Math.round((endedAt - startedAt) / 1000);
  if (span > MAX_SESSION_SECONDS) {
    throw new ExternalError('invalid_request', 400, '24時間を超える記録は登録できません');
  }
  let durationSeconds = span;
  if (b.durationSeconds !== undefined) {
    const d = b.durationSeconds;
    if (typeof d !== 'number' || !Number.isSafeInteger(d) || d <= 0 || d > span) {
      throw new ExternalError(
        'invalid_request',
        400,
        'durationSeconds は 1 以上で、startedAt〜endedAt の秒数以下の整数にしてください',
      );
    }
    durationSeconds = d;
  }
  if (durationSeconds < MIN_SESSION_SECONDS) {
    throw new ExternalError('invalid_request', 400, '1分未満の記録は登録できません');
  }
  let folderId: string | null = null;
  if (b.folderId !== undefined && b.folderId !== null) {
    if (typeof b.folderId !== 'string' || !/^[A-Za-z0-9._~:-]{1,128}$/.test(b.folderId)) {
      throw new ExternalError('invalid_request', 400, 'folderId が不正です');
    }
    folderId = b.folderId;
  }
  let folderName: string | null = null;
  if (b.folderName !== undefined && b.folderName !== null) {
    if (folderId !== null) {
      throw new ExternalError('invalid_request', 400, 'folderId と folderName は同時に指定できません');
    }
    if (typeof b.folderName !== 'string') {
      throw new ExternalError('invalid_request', 400, 'folderName が不正です');
    }
    folderName = normalizeFolderName(b.folderName);
    if (folderName.length < 1 || folderName.length > MAX_FOLDER_NAME) {
      throw new ExternalError('invalid_request', 400, `folderName は1〜${MAX_FOLDER_NAME}文字で指定してください`);
    }
  }
  return { externalId: b.externalId, startedAt, endedAt, durationSeconds, folderId, folderName };
}

/**
 * 学習記録を1件登録する。同じ externalId の再送は何も変えず `duplicate: true` を返す(冪等)。
 * レコードIDはトークンの持ち主と externalId から決まるので、別ユーザーの同じ externalId とは衝突しない。
 */
export async function recordExternalSession(
  driver: SyncDriver,
  userId: string,
  input: ExternalSessionInput,
  now: number,
): Promise<{ id: string; duplicate: boolean; folderId: string | null; folderCreated: boolean }> {
  // 重複チェックはフォルダーの検索・作成より先に行う(再送でフォルダーを作らない)
  const digest = (await sha256Hex(`${userId}\u0000${input.externalId}`)).slice(0, 40);
  const id = `ext-${digest}`;
  const existing = await driver.all<{ id: string; data: string }>({
    sql: "SELECT id, data FROM sync_records WHERE user_id = ? AND entity = 'study_sessions' AND id = ?",
    params: [userId, id],
  });
  if (existing.length > 0) {
    let prevFolder: string | null = null;
    try {
      const f = (JSON.parse(existing[0]!.data) as Record<string, unknown>).folder_id;
      if (typeof f === 'string') prevFolder = f;
    } catch {
      // 壊れたデータは未分類として扱う
    }
    return { id, duplicate: true, folderId: prevFolder, folderCreated: false };
  }

  const changes: Change[] = [];
  let folderId = input.folderId;
  let folderCreated = false;
  if (input.folderId !== null) {
    const folders = await driver.all<{ id: string }>({
      sql: `SELECT id FROM sync_records
            WHERE user_id = ? AND entity = 'folders' AND id = ? AND deleted_at IS NULL`,
      params: [userId, input.folderId],
    });
    if (folders.length === 0) throw new ExternalError('folder_not_found', 422, 'フォルダーが見つかりません');
  } else if (input.folderName !== null) {
    const name = input.folderName;
    const rows = await driver.all<{ id: string; data: string }>({
      sql: `SELECT id, data FROM sync_records
            WHERE user_id = ? AND entity = 'folders' AND deleted_at IS NULL`,
      params: [userId],
    });
    const matches = rows.flatMap((r) => {
      try {
        const d = JSON.parse(r.data) as Record<string, unknown>;
        if (typeof d.name !== 'string' || normalizeFolderName(d.name) !== name) return [];
        return [{ id: r.id, createdAt: typeof d.created_at === 'number' ? d.created_at : 0 }];
      } catch {
        return [];
      }
    });
    matches.sort((x, y) => x.createdAt - y.createdAt || x.id.localeCompare(y.id));
    if (matches[0]) {
      folderId = matches[0].id;
    } else {
      // 決定的なIDにして、同時リクエストでも同名フォルダーが二重に作られないようにする
      const deterministic = `extf-${(await sha256Hex(`${userId}\u0000${name}`)).slice(0, 40)}`;
      const taken = await driver.all<{ id: string; data: string; deleted_at: number | null }>({
        sql: "SELECT id, data, deleted_at FROM sync_records WHERE user_id = ? AND entity = 'folders' AND id = ?",
        params: [userId, deterministic],
      });
      let reusable = false;
      if (taken[0] && taken[0].deleted_at === null) {
        try {
          const n = (JSON.parse(taken[0].data) as Record<string, unknown>).name;
          reusable = typeof n === 'string' && normalizeFolderName(n) === name;
        } catch {
          // 壊れたデータは再利用しない
        }
      }
      if (reusable) {
        // 検索の後に並行リクエストが同名フォルダーを作成済み: それを使う
        folderId = deterministic;
      } else {
        // 同じIDが改名済み・削除済みで残っている場合はランダムなIDにする
        folderId = taken.length === 0 ? deterministic : crypto.randomUUID();
        folderCreated = true;
        changes.push({
          spec: ENTITY_BY_NAME.get('folders')!,
          id: folderId,
          opId: `extf-op-${digest}`,
          baseSeq: null,
          data: { name, created_at: now, updated_at: now, deleted_at: null },
        });
      }
    }
  }
  changes.push({
    spec: ENTITY_BY_NAME.get('study_sessions')!,
    id,
    opId: `ext-op-${digest}`,
    baseSeq: null,
    data: {
      folder_id: folderId,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      duration_seconds: input.durationSeconds,
      created_at: now,
    },
  });
  const results = await pushChanges(driver, userId, changes);
  if (results.length !== changes.length || results.some((r) => !r || r.status === 'retry')) {
    throw new Error('retry');
  }
  return { id, duplicate: false, folderId, folderCreated };
}

// ---- 読み取り(study_sessions:read)。対象は常にトークンの持ち主の学習記録だけ ----

export function requireScope(scopes: Scope[], needed: Scope): void {
  if (!scopes.includes(needed)) {
    throw new ExternalError('insufficient_scope', 403, `このAPIキーには ${needed} の権限がありません`);
  }
}

export type SessionView = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  folderId: string | null;
};

type StoredSession = { id: string; data: string };

function toView(row: StoredSession): SessionView | null {
  try {
    const d = JSON.parse(row.data) as Record<string, unknown>;
    if (typeof d.started_at !== 'number' || typeof d.ended_at !== 'number') return null;
    return {
      id: row.id,
      startedAt: new Date(d.started_at).toISOString(),
      endedAt: new Date(d.ended_at).toISOString(),
      durationSeconds: typeof d.duration_seconds === 'number' ? d.duration_seconds : 0,
      folderId: typeof d.folder_id === 'string' ? d.folder_id : null,
    };
  } catch {
    return null;
  }
}

function parseRange(query: { from?: string; to?: string }, now: number, maxDays: number) {
  const to = query.to === undefined ? now : parseTime(query.to, 'to');
  const from = query.from === undefined ? to - 7 * DAY_MS : parseTime(query.from, 'from');
  if (from >= to) throw new ExternalError('invalid_request', 400, 'from は to より前にしてください');
  if (to - from > maxDays * DAY_MS) {
    throw new ExternalError('invalid_request', 400, `期間は${maxDays}日までです`);
  }
  return { from, to };
}

/** 範囲内の自分の学習記録(削除済みを除く)。from <= startedAt < to */
async function sessionsInRange(driver: SyncDriver, userId: string, from: number, to: number) {
  const rows = await driver.all<StoredSession>({
    sql: `SELECT id, data FROM sync_records
          WHERE user_id = ? AND entity = 'study_sessions' AND deleted_at IS NULL
            AND json_extract(data, '$.started_at') >= ? AND json_extract(data, '$.started_at') < ?`,
    params: [userId, from, to],
  });
  return rows.flatMap((r) => toView(r) ?? []);
}

/**
 * 学習記録の一覧(startedAt の降順)。既定は直近7日、期間は最大366日。
 * カーソルは `<startedAtMs>:<id>` の不透明文字列。
 */
export async function listExternalSessions(
  driver: SyncDriver,
  userId: string,
  query: { from?: string; to?: string; limit?: string; cursor?: string },
  now: number,
): Promise<{ sessions: SessionView[]; nextCursor: string | null }> {
  const { from, to } = parseRange(query, now, 366);
  let limit = 50;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_READ_LIMIT) {
      throw new ExternalError('invalid_request', 400, `limit は 1〜${MAX_READ_LIMIT} の整数です`);
    }
  }
  const all = (await sessionsInRange(driver, userId, from, to)).sort(
    (a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id),
  );
  let start = 0;
  if (query.cursor !== undefined) {
    const m = /^(\d{1,15}):(.{1,64})$/.exec(query.cursor);
    if (!m) throw new ExternalError('invalid_request', 400, 'cursor が不正です');
    const key = new Date(Number(m[1])).toISOString();
    start = all.findIndex((x) => x.startedAt < key || (x.startedAt === key && x.id < m[2]!));
    if (start === -1) start = all.length;
  }
  const page = all.slice(start, start + limit);
  const last = page.at(-1);
  const hasMore = start + limit < all.length;
  return {
    sessions: page,
    nextCursor: hasMore && last ? `${Date.parse(last.startedAt)}:${last.id}` : null,
  };
}

/** 期間内の合計・日別・フォルダー別の学習時間。日の区切りは utcOffsetMinutes(日本は 540)で決める */
export async function summarizeExternalSessions(
  driver: SyncDriver,
  userId: string,
  query: { from?: string; to?: string; utcOffsetMinutes?: string },
  now: number,
) {
  const { from, to } = parseRange(query, now, MAX_SUMMARY_DAYS);
  let offset = 0;
  if (query.utcOffsetMinutes !== undefined) {
    offset = Number(query.utcOffsetMinutes);
    if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
      throw new ExternalError('invalid_request', 400, 'utcOffsetMinutes は -840〜840 の整数です');
    }
  }
  const sessions = await sessionsInRange(driver, userId, from, to);
  const days = new Map<string, { totalSeconds: number; sessionCount: number }>();
  const folders = new Map<string | null, number>();
  let totalSeconds = 0;
  for (const x of sessions) {
    totalSeconds += x.durationSeconds;
    const day = new Date(Date.parse(x.startedAt) + offset * 60_000).toISOString().slice(0, 10);
    const d = days.get(day) ?? { totalSeconds: 0, sessionCount: 0 };
    d.totalSeconds += x.durationSeconds;
    d.sessionCount += 1;
    days.set(day, d);
    folders.set(x.folderId, (folders.get(x.folderId) ?? 0) + x.durationSeconds);
  }
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    totalSeconds,
    sessionCount: sessions.length,
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    folders: [...folders].map(([folderId, seconds]) => ({ folderId, totalSeconds: seconds })),
  };
}
