import { sql } from 'drizzle-orm';

import { wipeDatabaseRows } from './local-wipe';
import { createRepositories } from './repositories';
import { createTestDatabase, createTestDeps } from './test-utils';

function counts(db: ReturnType<typeof createTestDatabase>) {
  const tables = db
    .all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND substr(name, 1, 7) <> 'sqlite_' AND name <> '__drizzle_migrations'`,
    )
    .map((r) => r.name);
  return Object.fromEntries(
    tables.map((t) => [t, db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ${sql.identifier(t)}`)[0]?.n ?? 0]),
  );
}

describe('wipeDatabaseRows', () => {
  it('全ユーザーデータ(同期用メタデータを含む)を消し、スキーマとマイグレーション履歴は残す', () => {
    const db = createTestDatabase();
    const { deps } = createTestDeps(db);
    const repos = createRepositories(deps);
    const folder = repos.folders.create({ name: '英語' });
    repos.notes.create({ title: 't', body: 'b', folderId: folder.id });
    repos.settings.set('appearance.darkMode', 'true');
    db.run(sql`INSERT INTO sync_outbox (entity, entity_id, created_at) VALUES ('notes', 'x', 1)`);
    db.run(sql`INSERT INTO sync_metadata (key, value, updated_at) VALUES ('sync.cursor', '5', 1)`);
    db.run(sql`INSERT INTO image_transfers (file_name, state, updated_at) VALUES ('a.png', 'uploaded', 1)`);
    const before = counts(db);
    expect(Object.values(before).some((n) => n > 0)).toBe(true);

    const cleared = wipeDatabaseRows(db);

    expect(cleared).toEqual(expect.arrayContaining(['folders', 'notes', 'settings', 'sync_outbox', 'sync_metadata', 'image_transfers']));
    expect(Object.values(counts(db)).every((n) => n === 0)).toBe(true);
    expect(Object.keys(counts(db))).toEqual(Object.keys(before));
    expect(db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM __drizzle_migrations`)[0]?.n).toBeGreaterThan(0);
  });

  it('消した後も通常どおり使える', () => {
    const db = createTestDatabase();
    const { deps } = createTestDeps(db);
    const repos = createRepositories(deps);
    repos.folders.create({ name: '旧' });
    wipeDatabaseRows(db);
    const folder = repos.folders.create({ name: '新' });
    expect(repos.folders.list().map((f) => f.id)).toEqual([folder.id]);
  });
});
