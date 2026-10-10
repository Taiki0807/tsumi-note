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

  // 同じ内容が既にあれば本体は再アップロードしない(重複排除)。念のためR2に実在するか確認する
  const key = keyFor(userId, sha256);
  const present = await store.head(key);
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
  return { sha256, size: input.bytes.length, deduplicated: present };
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
