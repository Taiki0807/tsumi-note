import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase } from '@/db/test-utils';

import { runSync, type SyncTransport } from './engine';
import { countPending } from './local-store';
import { createTestServer } from './test-server';

const DAY = 86_400_000;

function createDevice(prefix: string, userId: string, startTime: number) {
  const db = createTestDatabase();
  let time = startTime;
  let n = 0;
  const repos = createRepositories({ db, now: () => time, newId: () => `${prefix}-${++n}` });
  return {
    db,
    repos,
    tick: (ms = 1_000) => (time += ms),
    sync: (transport: SyncTransport) =>
      runSync({
        db,
        transport,
        userId,
        now: () => time,
        newId: () => `${prefix}-device`,
        isActive: () => true,
      }),
  };
}

function setup() {
  const server = createTestServer(['u1']);
  const a = createDevice('a', 'u1', 10 * DAY);
  const b = createDevice('b', 'u1', 9 * DAY);
  return { a, b, ca: server.connect('u1'), cb: server.connect('u1') };
}

describe('学習記録の編集の同期', () => {
  it('編集は outbox に積まれ、他端末の一覧・集計へ反映される', async () => {
    const { a, b, ca, cb } = setup();
    const folder = a.repos.folders.create({ name: '英語' });
    const s = a.repos.studySessions.record({
      id: 's1',
      folderId: null,
      startedAt: 1_000_000,
      endedAt: 1_060_000,
    });
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    expect(b.repos.studySessions.getById(s.id)?.durationSeconds).toBe(60);
    expect(countPending(a.db)).toBe(0);

    a.tick();
    a.repos.studySessions.update(s.id, {
      folderId: folder.id,
      startedAt: 1_000_000,
      endedAt: 1_300_000,
      durationSeconds: 300,
    });
    expect(countPending(a.db)).toBe(1);
    expect((await a.sync(ca.transport)).pushed).toBe(1);

    await b.sync(cb.transport);
    expect(b.repos.studySessions.getById(s.id)).toMatchObject({
      folderId: folder.id,
      durationSeconds: 300,
      endedAt: 1_300_000,
    });
    // 取り込んだ編集は再送されない
    expect(countPending(b.db)).toBe(0);
  });

  it('削除(墓標)は他端末の一覧から消える', async () => {
    const { a, b, ca, cb } = setup();
    a.repos.studySessions.record({ id: 's1', folderId: null, startedAt: 1, endedAt: 61_000 });
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    a.tick();
    a.repos.studySessions.softDelete('s1');
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    expect(b.repos.studySessions.listSince(0)).toEqual([]);
  });

  it('フォルダーの色も同期される', async () => {
    const { a, b, ca, cb } = setup();
    const f = a.repos.folders.create({ name: 'F', color: 'rose' });
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    expect(b.repos.folders.getById(f.id)?.color).toBe('rose');
    a.tick();
    a.repos.folders.setColor(f.id, 'teal');
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    expect(b.repos.folders.getById(f.id)?.color).toBe('teal');
  });

  it('旧形式(updated_at / deleted_at / color なし)のサーバーデータも取り込める', async () => {
    // 旧バージョンの端末が送った形式をそのままサーバーに置く
    const server = createTestServer(['u1']);
    const legacy = server.connect('u1');
    await legacy.transport.push([
      {
        entity: 'study_sessions',
        id: 'old-s',
        opId: 'op-old-1',
        baseSeq: null,
        data: {
          folder_id: null,
          started_at: 5_000,
          ended_at: 65_000,
          duration_seconds: 60,
          created_at: 5_000,
        },
      },
      {
        entity: 'folders',
        id: 'old-f',
        opId: 'op-old-2',
        baseSeq: null,
        data: { name: '旧', created_at: 1, updated_at: 1, deleted_at: null },
      },
    ]);
    const device = createDevice('c', 'u1', 11 * DAY);
    await device.sync(server.connect('u1').transport);
    expect(device.repos.studySessions.getById('old-s')).toMatchObject({
      createdAt: 5_000,
      updatedAt: 5_000,
      deletedAt: null,
    });
    expect(device.repos.folders.getById('old-f')?.color).toBeNull();
  });
});

describe('マイグレーション 0006 (学習記録の編集・フォルダーの色)', () => {
  it('既存データを保ったまま列を追加し、フォルダーの色を現在の表示色で埋める', () => {
    const dir = path.join(__dirname, '../../drizzle');
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const apply = (file: string) => {
      for (const stmt of readFileSync(path.join(dir, file), 'utf8').split('--> statement-breakpoint'))
        if (stmt.trim()) sqlite.exec(stmt);
    };
    for (const f of [
      '0000_init.sql',
      '0001_fsrs_review_add.sql',
      '0002_fsrs_review_drop_card.sql',
      '0003_goal_exam_day.sql',
      '0004_sync_outbox.sql',
      '0005_image_transfers.sql',
    ])
      apply(f);
    // 作成順 f1, f2, f3, f4(f2 は削除済み), f5。同時刻の f3 / f4 は rowid 順
    sqlite.exec(`INSERT INTO folders (id, created_at, updated_at, deleted_at, name) VALUES
      ('f1', 10, 10, NULL, 'a'), ('f2', 20, 20, 25, 'b'), ('f3', 30, 30, NULL, 'c'),
      ('f4', 30, 30, NULL, 'd'), ('f5', 40, 40, NULL, 'e');
      INSERT INTO study_sessions (id, created_at, folder_id, started_at, ended_at, duration_seconds)
      VALUES ('s1', 111, 'f1', 1000, 61000, 60)`);

    apply('0006_study_session_edit_folder_color.sql');

    const colors = sqlite.prepare('SELECT id, color FROM folders ORDER BY id').all();
    expect(colors).toEqual([
      { id: 'f1', color: 'primary' },
      { id: 'f2', color: null }, // 削除済みは対象外
      { id: 'f3', color: 'warning' },
      { id: 'f4', color: 'info' },
      { id: 'f5', color: 'primary' },
    ]);
    expect(sqlite.prepare('SELECT * FROM study_sessions').get()).toMatchObject({
      id: 's1',
      created_at: 111,
      updated_at: 111,
      deleted_at: null,
      duration_seconds: 60,
    });

    // 同期有効なDBでは、学習記録の更新も変更検知の対象になる
    sqlite.exec("INSERT INTO sync_metadata (key, value, updated_at) VALUES ('sync.capture', '1', 1)");
    sqlite.exec("UPDATE study_sessions SET duration_seconds = 90, updated_at = 200 WHERE id = 's1'");
    expect(sqlite.prepare('SELECT entity, entity_id FROM sync_outbox').all()).toEqual([
      { entity: 'study_sessions', entity_id: 's1' },
    ]);
  });
});
