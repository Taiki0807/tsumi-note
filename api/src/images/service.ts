import { isDeletionRequested } from '../account/service';
import type { SyncDriver } from '../sync/service';
import { ImageError, kindFromFileName, validateUpload } from './validate';

/**
 * ノート画像のサーバー側ロジック(R2 + D1)。
 *
 * - R2 のオブジェクトキーはサーバーが `u/<userId>/<sha256>` で決める。クライアントはファイル名しか渡せず、
 *   すべてのSQLは `user_id = ?`(セッション由来)で絞るので、他人の画像には到達できない(存在しない扱い)。
 * - 画像名は不変(ランダムID)。同名・同内容の再送は冪等。同名で別内容は 409。
 * - D1 の行は R2 への保存が成功した後にだけ書く。行がある = 本体がR2にある。
 */
export interface ObjectStore {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** prefix で始まるすべてのオブジェクトを削除する(アカウント削除用)。何度呼んでもよい */
  deletePrefix(prefix: string): Promise<void>;
}

/** アップロード直後の画像は、参照するノートの同期が追いつくまで削除を受け付けない */
export const DELETE_GRACE_MS = 24 * 60 * 60 * 1000;

type Row = {
  sha256: string;
  size: number;
  content_type: string;
  r2_key: string;
  created_at: number;
  deleted_at: number | null;
};

const keyFor = (userId: string, sha256: string) => `u/${userId}/${sha256}`;

async function findRow(driver: SyncDriver, userId: string, fileName: string): Promise<Row | undefined> {
  const rows = await driver.all<Row>({
    sql: `SELECT sha256, size, content_type, r2_key, created_at, deleted_at FROM image_objects
          WHERE user_id = ? AND file_name = ?`,
    params: [userId, fileName],
  });
  return rows[0];
}

export async function putImage(
  driver: SyncDriver,
  store: ObjectStore,
  userId: string,
  input: {
    fileName: string;
    bytes: Uint8Array;
    declaredSha256: string | undefined;
    contentType: string | undefined;
  },
  now: number,
): Promise<{ sha256: string; size: number; deduplicated: boolean }> {
  const { sha256, contentType } = await validateUpload(input);
  const existing = await findRow(driver, userId, input.fileName);
  if (existing && existing.sha256 !== sha256) throw new ImageError(409, 'file_name_conflict');

  // 書き込みの前に「進行中のアップロード」と「掃除タスク(書き込み先キー)」を1バッチで原子的に記録する。
  // どちらも削除依頼が出ていれば作れない。タスクはR2へ書く前に永続化されるので、書き込み後にD1が読めなくても、
  // アカウント削除の完了後に遅れて書き込まれても、定期掃除(sweepCleanupTasks)が書き込み先を特定して消せる。
  // 記録できなければ(D1障害など)R2へは何も書かない。
  const uploadId = crypto.randomUUID();
  const key = keyFor(userId, sha256);
  const [started] = await driver.batch([
    {
      sql: `INSERT INTO image_uploads (id, user_id, started_at)
            SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id = ?)`,
      params: [uploadId, userId, now, userId],
    },
    {
      sql: `INSERT INTO r2_cleanup_tasks (id, r2_key, user_id, created_at)
            SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id = ?)`,
      params: [uploadId, key, userId, now, userId],
    },
  ]);
  if (started !== 1) throw new ImageError(401, 'account_deleted');

  let present = false;
  try {
    // 同じ内容が既にあれば本体は再アップロードしない(重複排除)。念のためR2に実在するか確認する
    present = await store.head(key);
    if (!present) await store.put(key, input.bytes, contentType);

    // R2 への保存が成功してから行を書く(行がある = 本体がある)。削除済みの同名は復活させる
    await driver.batch([
      {
        sql: `INSERT INTO image_objects
                (user_id, file_name, sha256, size, content_type, r2_key, created_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
              ON CONFLICT (user_id, file_name) DO UPDATE SET deleted_at = NULL`,
        params: [userId, input.fileName, sha256, input.bytes.length, contentType, key, now],
      },
    ]);
  } catch (e) {
    // 削除中ならユーザー行の削除による外部キー違反などもここに来る。取り消したうえで 401 を返す
    if (await rollbackIfDeleting(driver, store, userId, key, uploadId)) {
      throw new ImageError(401, 'account_deleted');
    }
    throw e;
  }
  // 書き込み後に削除依頼が出ていたら、この書き込みを自分で取り消す(削除側の掃除より後に書いた分の回収)
  if (await rollbackIfDeleting(driver, store, userId, key, uploadId)) {
    throw new ImageError(401, 'account_deleted');
  }
  // 正常終了: 自分の記録だけを消す(同じキーの別アップロードのタスクには触れない)
  await driver.batch([
    { sql: 'DELETE FROM image_uploads WHERE id = ?', params: [uploadId] },
    { sql: 'DELETE FROM r2_cleanup_tasks WHERE id = ?', params: [uploadId] },
  ]);
  return { sha256, size: input.bytes.length, deduplicated: present };
}

/**
 * 削除依頼が出ていれば、書き込んだオブジェクトを取り消して true を返す(出ていなければ何もせず false)。
 *
 * - 掃除タスクは書き込み前に記録済み。ここでは新たに記録しないので、D1の読み取りが失敗しても追跡情報は失われない。
 *   削除依頼の確認に失敗したら握りつぶさず例外にする(アップロード記録とタスクは残り、500 になる)。
 *   後でそのユーザーの削除が行われれば、定期掃除がタスクから R2 のキーを回収する。
 * - R2 の削除に失敗したらタスクを残し、ログを出して true を返す(呼び出し側は 401)。再試行は定期掃除が冪等に行う。
 */
async function rollbackIfDeleting(
  driver: SyncDriver,
  store: ObjectStore,
  userId: string,
  key: string,
  uploadId: string,
): Promise<boolean> {
  if (!(await isDeletionRequested(driver, userId))) return false;
  try {
    await store.delete(key);
  } catch (e) {
    console.error('[images] 取り消しに失敗しました。定期掃除で再試行します', e instanceof Error ? e.message : 'unknown');
    return true;
  }
  try {
    await driver.batch([
      { sql: 'DELETE FROM image_objects WHERE user_id = ? AND r2_key = ?', params: [userId, key] },
      { sql: 'DELETE FROM r2_cleanup_tasks WHERE id = ?', params: [uploadId] },
      { sql: 'DELETE FROM image_uploads WHERE id = ?', params: [uploadId] },
    ]);
  } catch (e) {
    // R2 は消えている。残った記録は定期掃除が冪等に片付ける
    console.error('[images] 取り消し後の記録削除に失敗しました', e instanceof Error ? e.message : 'unknown');
  }
  return true;
}

export async function getImage(
  driver: SyncDriver,
  store: ObjectStore,
  userId: string,
  fileName: string,
): Promise<{ bytes: Uint8Array; sha256: string; contentType: string } | null> {
  if (!kindFromFileName(fileName)) return null;
  const row = await findRow(driver, userId, fileName);
  if (!row || row.deleted_at !== null) return null;
  const bytes = await store.get(row.r2_key);
  return bytes ? { bytes, sha256: row.sha256, contentType: row.content_type } : null;
}

/**
 * 画像を削除する(冪等)。次の場合は削除せず 409:
 * - 同期済みの有効なノートがまだ参照している
 * - アップロードから猶予時間が経っていない(参照するノートが未同期の可能性)
 * R2 の本体は、同じ内容を指す他の行が無いときだけ消す。
 */
export async function deleteImage(
  driver: SyncDriver,
  store: ObjectStore,
  userId: string,
  fileName: string,
  now: number,
): Promise<'deleted' | 'absent'> {
  if (!kindFromFileName(fileName)) throw new ImageError(400, 'invalid_file_name');
  const row = await findRow(driver, userId, fileName);
  if (!row || row.deleted_at !== null) return 'absent';
  if (now - row.created_at < DELETE_GRACE_MS) throw new ImageError(409, 'recently_uploaded');
  const refs = await driver.all<{ n: number }>({
    sql: `SELECT COUNT(*) AS n FROM sync_records
          WHERE user_id = ? AND entity = 'notes' AND deleted_at IS NULL
            AND instr(data, ?) > 0`,
    params: [userId, `note-image://${fileName}`],
  });
  if ((refs[0]?.n ?? 0) > 0) throw new ImageError(409, 'in_use');

  await driver.batch([
    {
      sql: `UPDATE image_objects SET deleted_at = ? WHERE user_id = ? AND file_name = ? AND deleted_at IS NULL`,
      params: [now, userId, fileName],
    },
  ]);
  const others = await driver.all<{ n: number }>({
    sql: `SELECT COUNT(*) AS n FROM image_objects WHERE user_id = ? AND sha256 = ? AND deleted_at IS NULL`,
    params: [userId, row.sha256],
  });
  if ((others[0]?.n ?? 0) === 0) await store.delete(row.r2_key);
  return 'deleted';
}
