import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { pullChanges, pushChanges, type SqlStatement, type SyncDriver } from '../../api/src/sync/service';
import { parsePush } from '../../api/src/sync/validate';
import type { SyncTransport } from './engine';

/**
 * テスト専用: 実際のサーバー実装(api/src/sync)を better-sqlite3 上で動かす。
 * 本番D1と同じ migration SQL を使い、クライアントのエンジンと結合してテストできる。
 */
export function createTestServer(users: string[]) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec('CREATE TABLE user (id text PRIMARY KEY NOT NULL)');
  for (const u of users) sqlite.prepare('INSERT INTO user (id) VALUES (?)').run(u);
  const migration = readFileSync(path.join(__dirname, '../../api/migrations/0001_sync.sql'), 'utf8');
  for (const stmt of migration.split('--> statement-breakpoint')) if (stmt.trim()) sqlite.exec(stmt);

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

  return { sqlite, connect };
}
