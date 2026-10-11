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

/**
 * user 行は消えたが R2 の掃除が済んでいない削除を完了させ、完了済みの削除済みアカウントのプレフィックスを再走査する(定期実行)。
 * 完了した件数を返す。
 *
 * 未完了のR2書き込みがいつまでに終わるかの上限は保証できないため、再走査は「一定期間で打ち切る」ことをしない。
 * 代わりに間隔を段階的に空ける(〜7日は毎回、〜90日は週1回、以降は月1回)。1回の実行は最終走査時刻の古い順に50件までで、
 * 1件あたり list 1回(該当があれば delete も)。運用コストはアカウント数に比例して増えるが、1回あたりは一定に抑えられる。
 */
export async function sweepDeletions(driver: SyncDriver, store: ObjectStore, now: number): Promise<number> {
  const rows = await driver.all<{ user_id: string; completed_at: number | null }>({
    sql: `SELECT d.user_id, d.completed_at FROM account_deletions d
          WHERE NOT EXISTS (SELECT 1 FROM user u WHERE u.id = d.user_id)
            AND (d.completed_at IS NULL OR d.last_scanned_at IS NULL OR d.last_scanned_at <= ? - CASE
                   WHEN ? - d.requested_at <= ? THEN 0
                   WHEN ? - d.requested_at <= ? THEN ?
                   ELSE ? END)
          ORDER BY COALESCE(d.last_scanned_at, 0), d.requested_at LIMIT 50`,
    params: [
      now,
      now,
      RESCAN_FAST_AGE_MS,
      now,
      RESCAN_MID_AGE_MS,
      RESCAN_MID_INTERVAL_MS,
      RESCAN_SLOW_INTERVAL_MS,
    ],
  });
  let done = 0;
  for (const { user_id, completed_at } of rows) {
    if (completed_at !== null) {
      // 完了済み: 再走査だけ。成功したときだけ最終走査時刻を進める(失敗は次回に再試行)
      try {
        await store.deletePrefix(r2PrefixFor(user_id));
        await driver.batch([
          { sql: 'UPDATE account_deletions SET last_scanned_at = ? WHERE user_id = ?', params: [now, user_id] },
        ]);
      } catch (e) {
        console.error('[account] 再走査に失敗しました', e instanceof Error ? e.message : 'unknown');
      }
      continue;
    }
    // 進行中のアップロードがあれば完了にせず次回へ回す(失効後に再掃除して完了する)
    if (await hasLiveUploads(driver, user_id, now)) continue;
    await store.deletePrefix(r2PrefixFor(user_id));
    await driver.batch([
      { sql: 'DELETE FROM image_uploads WHERE user_id = ?', params: [user_id] },
      {
        sql: 'UPDATE account_deletions SET completed_at = ?, last_scanned_at = ? WHERE user_id = ?',
        params: [now, now, user_id],
      },
    ]);
    done++;
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
