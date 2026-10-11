import type { ObjectStore } from '../images/service';
import type { SyncDriver } from '../sync/service';

/** ソーシャルのみのアカウントが削除できる、ログインからの最大経過時間(再認証の代わり) */
export const FRESH_SESSION_MS = 5 * 60 * 1000;
/** パスワード照合の試行制限(ユーザー単位) */
export const DELETE_ATTEMPT_WINDOW_MS = 60 * 1000;
export const DELETE_ATTEMPT_MAX = 5;

/** 画像アップロードの有効期間。これを過ぎた記録は異常終了とみなし、削除の完了を妨げない */
export const UPLOAD_LEASE_MS = 10 * 60 * 1000;

/**
 * 掃除タスクの保持期間(リース + これ)。アップロードは UPLOAD_LEASE_MS で待機を打ち切るが、R2 の書き込み自体は
 * 中断できず、いつ終わるかの上限は保証できない。そのため「待てば終わっているはず」には依存せず、
 * この期間は R2 のキー(タスク)とアカウントのプレフィックス(sweepDeletions)を繰り返し削除し続ける。
 * 掃除タスクの保持はこの期間で終わるが、削除済みアカウントのプレフィックス再走査(sweepDeletions)は打ち切らず間隔を空けて続ける。
 */
export const CLEANUP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
/** 生きているアカウントのタスクを処理し始める、リース終了からの余白(コミット中のアップロードを消さないため) */
const LIVE_USER_MARGIN_MS = 10 * 60 * 1000;

/** 進行中のアップロードがあるため削除を完了できない(アップロードの終了後に再試行で完了する) */
export class DeletionPendingError extends Error {
  constructor() {
    super('uploads in flight');
  }
}

export function r2PrefixFor(userId: string): string {
  return `u/${userId}/`;
}

/** 有効な(失効していない)進行中のアップロードがあるか */
export async function hasLiveUploads(driver: SyncDriver, userId: string, now: number): Promise<boolean> {
  const rows = await driver.all<{ n: number }>({
    sql: 'SELECT COUNT(*) AS n FROM image_uploads WHERE user_id = ? AND started_at > ?',
    params: [userId, now - UPLOAD_LEASE_MS],
  });
  return (rows[0]?.n ?? 0) > 0;
}

export async function isDeletionRequested(driver: SyncDriver, userId: string): Promise<boolean> {
  const rows = await driver.all<{ user_id: string }>({
    sql: 'SELECT user_id FROM account_deletions WHERE user_id = ?',
    params: [userId],
  });
  return rows.length > 0;
}

export async function listProviders(driver: SyncDriver, userId: string): Promise<string[]> {
  const rows = await driver.all<{ provider_id: string }>({
    sql: 'SELECT provider_id FROM account WHERE user_id = ? ORDER BY provider_id',
    params: [userId],
  });
  return rows.map((r) => r.provider_id);
}

export async function getPasswordHash(driver: SyncDriver, userId: string): Promise<string | null> {
  const rows = await driver.all<{ password: string | null }>({
    sql: "SELECT password FROM account WHERE user_id = ? AND provider_id = 'credential'",
    params: [userId],
  });
  return rows[0]?.password ?? null;
}

/** 試行を1回記録し、上限を超えていれば false。既存の rate_limit テーブル(Better Auth と同形式)を使う */
export async function consumeDeleteAttempt(driver: SyncDriver, userId: string, now: number): Promise<boolean> {
  const key = `delete-account:${userId}`;
  const rows = await driver.all<{ count: number; last_request: number }>({
    sql: 'SELECT count, last_request FROM rate_limit WHERE key = ?',
    params: [key],
  });
  const row = rows[0];
  if (!row || now - row.last_request > DELETE_ATTEMPT_WINDOW_MS) {
    await driver.batch([
      {
        sql: 'INSERT INTO rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, last_request = excluded.last_request',
        params: [key, key, now],
      },
    ]);
    return true;
  }
  if (row.count >= DELETE_ATTEMPT_MAX) return false;
  await driver.batch([{ sql: 'UPDATE rate_limit SET count = count + 1 WHERE key = ?', params: [key] }]);
  return true;
}

/**
 * アカウントを削除する。何度呼んでも同じ結果になり(冪等)、途中で失敗したら同じ要求を再送すれば続きから完了する。
 *
 * 1. 削除の依頼を記録(以降、このユーザーは /v1/* を使えない=他端末からの再同期を遮断)
 * 2. R2 の `u/<userId>/` 配下を削除
 * 3. D1 の user 行を削除(session / account / sync_* / image_objects は ON DELETE CASCADE)
 * 4. 並行アップロードの取りこぼしを R2 から再度掃除し、完了を記録
 *
 * R2 の削除に失敗した場合は user 行を消さない(=セッションが残り、利用者が再試行できる)。
 * 完了を返すのは 3 まで成功した後。4 の失敗は completed_at が NULL のまま残り、sweepDeletions が再実行する。
 * 削除対象はすべて userId で絞る(他アカウントには触れない)。
 */
export async function deleteAccount(
  driver: SyncDriver,
  store: ObjectStore,
  userId: string,
  now: number,
): Promise<void> {
  await driver.batch([
    {
      sql: 'INSERT OR IGNORE INTO account_deletions (user_id, requested_at) VALUES (?, ?)',
      params: [userId, now],
    },
  ]);
  await store.deletePrefix(r2PrefixFor(userId));
  // 削除依頼の記録後は新規アップロードを作れない。進行中のものが無ければ以後R2へ書き込まれることもない。
  // 進行中のものがあれば user 行を残して中断する(アップロード側が書き込み後に自分で取り消す。再試行で完了)
  if (await hasLiveUploads(driver, userId, now)) throw new DeletionPendingError();
  await driver.batch([
    // 再設定トークンの検証レコード(value にユーザーIDが入る)も消す
    { sql: 'DELETE FROM verification WHERE value = ?', params: [userId] },
    { sql: 'DELETE FROM rate_limit WHERE key = ?', params: [`delete-account:${userId}`] },
    { sql: 'DELETE FROM user WHERE id = ?', params: [userId] },
  ]);
  try {
    await store.deletePrefix(r2PrefixFor(userId));
    await driver.batch([
      { sql: 'DELETE FROM image_uploads WHERE user_id = ?', params: [userId] },
      { sql: 'UPDATE account_deletions SET completed_at = ? WHERE user_id = ?', params: [now, userId] },
    ]);
  } catch (e) {
    // user 行は削除済み。残骸の掃除は sweepDeletions が再実行する(ユーザーIDはログに出さない)
    console.error('[account] R2 の最終掃除に失敗しました', e instanceof Error ? e.message : 'unknown');
  }
}

/** 完了済みの削除の再走査間隔。経過が長いほど間隔を空け、コストを抑えつつ打ち切らない */
const DAY_MS = 24 * 60 * 60 * 1000;
const RESCAN_FAST_AGE_MS = 7 * DAY_MS; // 〜7日: 毎回
const RESCAN_MID_AGE_MS = 90 * DAY_MS; // 〜90日: 週1回
const RESCAN_MID_INTERVAL_MS = 7 * DAY_MS;
const RESCAN_SLOW_INTERVAL_MS = 30 * DAY_MS; // それ以降: 月1回

/** 走査を試みる前に次回予定をこの分だけ先送りして「予約」する(重複実行・途中停止・失敗の記録失敗でも先頭を占有しない) */
export const SCAN_CLAIM_MS = 5 * 60 * 1000;
/** 失敗時の指数バックオフ: 基準 × 2^(失敗回数-1)、上限つき(放棄はしない)。±20% のジッター */
const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = DAY_MS;
const SWEEP_BATCH = 50;

function rescanInterval(requestedAt: number, now: number): number {
  const age = now - requestedAt;
  if (age <= RESCAN_FAST_AGE_MS) return 0;
  return age <= RESCAN_MID_AGE_MS ? RESCAN_MID_INTERVAL_MS : RESCAN_SLOW_INTERVAL_MS;
}

/** 失敗 n 回目(1始まり)の再試行までの待ち時間 */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(Math.max(failures - 1, 0), 20));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/**
 * user 行は消えたが R2 の掃除が済んでいない削除を完了させ、完了済みの削除済みアカウントのプレフィックスを再走査する(定期実行)。
 * 完了した件数を返す。
 *
 * スケジューリング(最後に成功した時刻 last_scanned_at と、次に試みる時刻 next_scan_at は別):
 * - 取得は `next_scan_at <= now` の行を `next_scan_at` 昇順に 50 件まで。
 * - 走査の前に、条件付き UPDATE(`next_scan_at <= now` のとき `now + SCAN_CLAIM_MS` へ)で行を予約する。変更が 1 件のときだけ走査する
 *   ので、cron が重複実行しても同じ行を二重に処理しない。予約は結果の記録より前に済むため、結果の記録(D1更新)が失敗しても、
 *   Workers が途中で止まっても、行は先頭に居座らず、予約時刻の経過後に再び対象になる。予約自体に失敗した行はその場で飛ばす。
 * - 成功: `last_scanned_at = now`、失敗回数 0、次回は経過に応じた間隔(〜7日は毎回、〜90日は週1回、以降は月1回)後。
 * - 失敗: 失敗回数 +1、次回は指数バックオフ(上限1日・ジッターつき)後。放棄はしない。
 * 1件の失敗は他の行の処理を止めない。1回の実行は 50 件まで、1件あたり list 1回(該当があれば delete も)。
 */
export async function sweepDeletions(
  driver: SyncDriver,
  store: ObjectStore,
  now: number,
  random: () => number = Math.random,
): Promise<number> {
  const rows = await driver.all<{
    user_id: string;
    requested_at: number;
    completed_at: number | null;
    scan_failures: number;
  }>({
    sql: `SELECT d.user_id, d.requested_at, d.completed_at, d.scan_failures FROM account_deletions d
          WHERE d.next_scan_at <= ? AND NOT EXISTS (SELECT 1 FROM user u WHERE u.id = d.user_id)
          ORDER BY d.next_scan_at, d.requested_at LIMIT ?`,
    params: [now, SWEEP_BATCH],
  });
  let done = 0;
  for (const { user_id, requested_at, completed_at, scan_failures } of rows) {
    try {
      const [claimed] = await driver.batch([
        {
          sql: 'UPDATE account_deletions SET next_scan_at = ? WHERE user_id = ? AND next_scan_at <= ?',
          params: [now + SCAN_CLAIM_MS, user_id, now],
        },
      ]);
      if (claimed !== 1) continue; // 別のWorkerが処理中
    } catch (e) {
      console.error('[account] 再走査の予約に失敗しました', e instanceof Error ? e.message : 'unknown');
      continue;
    }
    try {
      const next = now + rescanInterval(requested_at, now);
      if (completed_at !== null) {
        await store.deletePrefix(r2PrefixFor(user_id));
        await driver.batch([
          {
            sql: 'UPDATE account_deletions SET last_scanned_at = ?, scan_failures = 0, next_scan_at = ? WHERE user_id = ?',
            params: [now, next, user_id],
          },
        ]);
        continue;
      }
      // 進行中のアップロードがあれば完了にせず次回(予約時刻の経過後)へ回す
      if (await hasLiveUploads(driver, user_id, now)) continue;
      await store.deletePrefix(r2PrefixFor(user_id));
      await driver.batch([
        { sql: 'DELETE FROM image_uploads WHERE user_id = ?', params: [user_id] },
        {
          sql: 'UPDATE account_deletions SET completed_at = ?, last_scanned_at = ?, scan_failures = 0, next_scan_at = ? WHERE user_id = ?',
          params: [now, now, next, user_id],
        },
      ]);
      done++;
    } catch (e) {
      console.error('[account] 再走査に失敗しました', e instanceof Error ? e.message : 'unknown');
      // 失敗の記録は best effort。失敗しても予約済みの next_scan_at により先頭を占有しない
      await driver
        .batch([
          {
            sql: 'UPDATE account_deletions SET scan_failures = scan_failures + 1, next_scan_at = ? WHERE user_id = ?',
            params: [now + backoffMs(scan_failures + 1, random), user_id],
          },
        ])
        .catch(() => undefined);
    }
  }
  return done;
}

/**
 * 永続的な掃除タスク(r2_cleanup_tasks)を処理する(定期実行)。削除が完了済みのアカウントでも対象にする。
 * 削除依頼のあるユーザーのキーだけを、そのユーザーのプレフィックス配下に限って削除する。
 * 失敗したタスクは残して次回に再試行する(冪等)。処理を終えた件数を返す。
 */
export async function sweepCleanupTasks(
  driver: SyncDriver,
  store: ObjectStore,
  now: number = Date.now(),
): Promise<number> {
  // 削除依頼のあるユーザーのタスクは常に対象。生きているユーザーのタスクは、アップロードのリースと余白が過ぎたものだけ
  // (中断・失敗したアップロードの残骸。キーは一意で、image_objects が参照していなければ誰も使わない)
  const rows = await driver.all<{
    id: string;
    r2_key: string;
    user_id: string;
    created_at: number;
    deleted: number;
  }>({
    sql: `SELECT t.id, t.r2_key, t.user_id, t.created_at,
                 EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id = t.user_id) AS deleted
          FROM r2_cleanup_tasks t
          WHERE t.created_at < ? OR EXISTS (SELECT 1 FROM account_deletions d WHERE d.user_id = t.user_id)
          ORDER BY t.created_at LIMIT 100`,
    params: [now - UPLOAD_LEASE_MS - LIVE_USER_MARGIN_MS],
  });
  let done = 0;
  for (const { id, r2_key, user_id, created_at, deleted } of rows) {
    if (!r2_key.startsWith(r2PrefixFor(user_id))) continue;
    try {
      if (!deleted) {
        // 生きているユーザー: 本体を参照する行があれば(コミット済みの消し残し)、R2には触れずタスクだけ捨てる
        const refs = await driver.all<{ n: number }>({
          sql: 'SELECT COUNT(*) AS n FROM image_objects WHERE user_id = ? AND r2_key = ?',
          params: [user_id, r2_key],
        });
        if ((refs[0]?.n ?? 0) > 0) {
          await driver.batch([{ sql: 'DELETE FROM r2_cleanup_tasks WHERE id = ?', params: [id] }]);
          done++;
          continue;
        }
      }
      await store.delete(r2_key);
      // リース失効 = 書き込み完了ではない。停止していた書き込みが後から着地し得るので、
      // 保証期間(リース + 猶予)が過ぎるまでタスクは消さず、次回以降も同じキーを削除する(冪等)
      if (now >= created_at + UPLOAD_LEASE_MS + CLEANUP_GRACE_MS) {
        await driver.batch([{ sql: 'DELETE FROM r2_cleanup_tasks WHERE id = ?', params: [id] }]);
        done++;
      }
    } catch (e) {
      console.error('[account] 掃除タスクの実行に失敗しました', e instanceof Error ? e.message : 'unknown');
      await driver
        .batch([{ sql: 'UPDATE r2_cleanup_tasks SET attempts = attempts + 1 WHERE id = ?', params: [id] }])
        .catch(() => undefined);
    }
  }
  return done;
}
