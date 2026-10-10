import type { SqlStatement, SyncDriver } from './service';

/** D1 用ドライバー。batch は D1 のトランザクション(全か無)で実行される */
export function createD1Driver(db: D1Database): SyncDriver {
  const prepare = (s: SqlStatement) => db.prepare(s.sql).bind(...s.params);
  return {
    async all<T>(s: SqlStatement): Promise<T[]> {
      const res = await prepare(s).all<T>();
      return res.results;
    },
    async batch(statements: SqlStatement[]): Promise<number[]> {
      const results = await db.batch(statements.map(prepare));
      return results.map((r) => r.meta.changes ?? 0);
    },
  };
}
