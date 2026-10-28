import { ENTITY_BY_NAME } from '../sync/entities';
import { pushChanges, type SqlStatement, type SyncDriver } from '../sync/service';
import type { Change } from '../sync/validate';

/**
 * 外部サービス連携API(v1.1.0)。
 *
 * - 認証は個人APIトークン(`Authorization: Bearer tsn_...`)。トークンはSHA-256ハッシュだけを保存し、作成時に一度だけ表示する。
 * - トークンの権限は「学習記録の登録」だけ。読み取り・アカウント操作・他のエンティティの書き込みには使えない。
 * - 書き込み先のユーザーは常にトークンの持ち主(本文・クエリのユーザーIDは存在しない)。
 * - 登録した学習記録は通常の同期レコード(study_sessions)になり、アプリは次回の同期で受け取る。
 */
export const TOKEN_PREFIX = 'tsn_';
export const MAX_ACTIVE_TOKENS = 5;
export const MAX_TOKEN_NAME = 50;
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
    readonly status: 400 | 401 | 404 | 409 | 422 | 429,
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
};

export async function listTokens(driver: SyncDriver, userId: string): Promise<TokenInfo[]> {
  const rows = await driver.all<{
    id: string;
    name: string;
    token_prefix: string;
    created_at: number;
    last_used_at: number | null;
  }>({
    sql: `SELECT id, name, token_prefix, created_at, last_used_at FROM api_tokens
          WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at`,
    params: [userId],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.token_prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

/** 新しいトークンを発行する。返す `token` は平文で、この呼び出しでしか得られない */
export async function createToken(
  driver: SyncDriver,
  userId: string,
  rawName: unknown,
  now: number,
): Promise<TokenInfo & { token: string }> {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name.length === 0 || name.length > MAX_TOKEN_NAME) {
    throw new ExternalError('invalid_name', 400, `名前は1〜${MAX_TOKEN_NAME}文字で入力してください`);
  }
  if ((await listTokens(driver, userId)).length >= MAX_ACTIVE_TOKENS) {
    throw new ExternalError('too_many_tokens', 409, `トークンは${MAX_ACTIVE_TOKENS}個までです`);
  }
  const token = TOKEN_PREFIX + base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const id = crypto.randomUUID();
  const prefix = token.slice(0, TOKEN_PREFIX.length + 6);
  await driver.batch([
    {
      sql: `INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [id, userId, name, await sha256Hex(token), prefix, now],
    },
  ]);
  return { id, name, prefix, createdAt: now, lastUsedAt: null, token };
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
): Promise<{ userId: string; tokenId: string } | null> {
  const match = /^Bearer (tsn_[A-Za-z0-9_-]{20,100})$/.exec(authorization ?? '');
  if (!match) return null;
  const rows = await driver.all<{ id: string; user_id: string }>({
    sql: `SELECT t.id, t.user_id FROM api_tokens t JOIN user u ON u.id = t.user_id
          WHERE t.token_hash = ? AND t.revoked_at IS NULL AND u.email_verified = 1
            AND NOT EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id = t.user_id)`,
    params: [await sha256Hex(match[1]!)],
  });
  const row = rows[0];
  if (!row) return null;
  // 最終利用時刻は目安。失敗しても認証は成功させる
  await driver
    .batch([{ sql: 'UPDATE api_tokens SET last_used_at = ? WHERE id = ?', params: [now, row.id] }])
    .catch(() => undefined);
  return { userId: row.user_id, tokenId: row.id };
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
};

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
  const allowed = new Set(['externalId', 'startedAt', 'endedAt', 'durationSeconds', 'folderId']);
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
  let folderId: string | null = null;
  if (b.folderId !== undefined && b.folderId !== null) {
    if (typeof b.folderId !== 'string' || !/^[A-Za-z0-9._~:-]{1,128}$/.test(b.folderId)) {
      throw new ExternalError('invalid_request', 400, 'folderId が不正です');
    }
    folderId = b.folderId;
  }
  return { externalId: b.externalId, startedAt, endedAt, durationSeconds, folderId };
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
): Promise<{ id: string; duplicate: boolean }> {
  if (input.folderId !== null) {
    const folders = await driver.all<{ id: string }>({
      sql: `SELECT id FROM sync_records
            WHERE user_id = ? AND entity = 'folders' AND id = ? AND deleted_at IS NULL`,
      params: [userId, input.folderId],
    });
    if (folders.length === 0) throw new ExternalError('folder_not_found', 422, 'フォルダーが見つかりません');
  }
  const digest = (await sha256Hex(`${userId}\u0000${input.externalId}`)).slice(0, 40);
  const id = `ext-${digest}`;
  const existing = await driver.all<{ id: string }>({
    sql: "SELECT id FROM sync_records WHERE user_id = ? AND entity = 'study_sessions' AND id = ?",
    params: [userId, id],
  });
  if (existing.length > 0) return { id, duplicate: true };
  const change: Change = {
    spec: ENTITY_BY_NAME.get('study_sessions')!,
    id,
    opId: `ext-op-${digest}`,
    baseSeq: null,
    data: {
      folder_id: input.folderId,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      duration_seconds: input.durationSeconds,
      created_at: now,
    },
  };
  const [result] = await pushChanges(driver, userId, [change]);
  if (!result || result.status === 'retry') throw new Error('retry');
  return { id, duplicate: false };
}
