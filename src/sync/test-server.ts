import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { deleteImage, getImage, putImage, type ObjectStore } from '../../api/src/images/service';
import { ImageError } from '../../api/src/images/validate';
import { pullChanges, pushChanges, type SqlStatement, type SyncDriver } from '../../api/src/sync/service';
import { parsePush } from '../../api/src/sync/validate';
import type { SyncTransport } from './engine';
import { SyncNetworkError } from './http-transport';
import { ImageRejectedError, type ImageTransport } from './image-sync';

/**
 * テスト専用: 実際のサーバー実装(api/src/sync)を better-sqlite3 上で動かす。
 * 本番D1と同じ migration SQL を使い、クライアントのエンジンと結合してテストできる。
 */
export function createTestServer(users: string[]) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec('CREATE TABLE user (id text PRIMARY KEY NOT NULL)');
  for (const u of users) sqlite.prepare('INSERT INTO user (id) VALUES (?)').run(u);
  for (const file of ['0001_sync.sql', '0002_images.sql']) {
    const migration = readFileSync(path.join(__dirname, '../../api/migrations', file), 'utf8');
    for (const stmt of migration.split('--> statement-breakpoint')) if (stmt.trim()) sqlite.exec(stmt);
  }
  /** R2 の代わり(キーはサーバーが決めたものがそのまま入る) */
  const objects = new Map<string, Uint8Array>();
  const store: ObjectStore = {
    async put(key, data) {
      objects.set(key, data.slice());
    },
    async get(key) {
      return objects.get(key)?.slice() ?? null;
    },
    async head(key) {
      return objects.has(key);
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  /** サーバーの時計(画像削除の猶予時間の判定に使う) */
  const clock = { now: 1_000_000 };

  const driver: SyncDriver = {
    async all<T>(s: SqlStatement): Promise<T[]> {
      return sqlite.prepare(s.sql).all(...s.params) as T[];
    },
    async batch(statements: SqlStatement[]): Promise<number[]> {
      return sqlite.transaction(() =>
        statements.map((s) => sqlite.prepare(s.sql).run(...s.params).changes),
      )();
    },
  };

  /** ユーザーごとのクライアント接続。障害の注入(オフライン / 応答の消失)ができる */
  function connect(userId: string) {
    const faults = { offline: false, loseNextPushResponse: false, failPullAfter: -1 };
    let pulls = 0;
    const transport: SyncTransport = {
      async push(changes) {
        if (faults.offline) throw new Error('offline');
        const { changes: parsed } = parsePush(JSON.parse(JSON.stringify({ changes })));
        const results = await pushChanges(driver, userId, parsed);
        if (faults.loseNextPushResponse) {
          faults.loseNextPushResponse = false;
          throw new Error('response lost');
        }
        return JSON.parse(JSON.stringify({ userId, results }));
      },
      async pull(cursor, limit) {
        if (faults.offline) throw new Error('offline');
        if (faults.failPullAfter >= 0 && pulls++ >= faults.failPullAfter)
          throw new Error('connection dropped');
        return JSON.parse(JSON.stringify({ userId, ...(await pullChanges(driver, userId, cursor, limit)) }));
      },
    };
    return { transport, faults };
  }

  /** 画像APIの接続。実際のサーバー実装(api/src/images)を呼び、HTTP と同じ区別(拒否・不在・参照中)を返す */
  function connectImages(userId: string) {
    const faults = { offline: false, failNextUploads: 0 };
    const transport: ImageTransport = {
      async upload(fileName, bytes, sha256, mimeType) {
        if (faults.offline) throw new SyncNetworkError('offline');
        if (faults.failNextUploads > 0) {
          faults.failNextUploads--;
          throw new SyncNetworkError('connection dropped');
        }
        try {
          await putImage(
            driver,
            store,
            userId,
            { fileName, bytes: bytes.slice(), declaredSha256: sha256, contentType: mimeType },
            clock.now,
          );
        } catch (e) {
          if (e instanceof ImageError) throw new ImageRejectedError(e.code, e.status);
          throw e;
        }
      },
      async download(fileName) {
        if (faults.offline) throw new SyncNetworkError('offline');
        const found = await getImage(driver, store, userId, fileName);
        return found ? { bytes: found.bytes, sha256: found.sha256 } : null;
      },
      async remove(fileName) {
        if (faults.offline) throw new SyncNetworkError('offline');
        try {
          return await deleteImage(driver, store, userId, fileName, clock.now);
        } catch (e) {
          if (e instanceof ImageError && e.status === 409) return 'in_use';
          throw e;
        }
      },
    };
    return { transport, faults };
  }

  return { sqlite, connect, connectImages, objects, clock };
}
