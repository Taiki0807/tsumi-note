import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase } from '@/db/test-utils';
import type { AppDatabase } from '@/db/types';

import { runSync, SyncStoppedError, type SyncTransport } from './engine';
import { countPending, getMeta, META } from './local-store';
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
    sync: (transport: SyncTransport, extra: { pullLimit?: number; isActive?: () => boolean } = {}) =>
      runSync({
        db,
        transport,
        userId,
        now: () => time,
        newId: () => `${prefix}-device`,
        isActive: extra.isActive ?? (() => true),
        pullLimit: extra.pullLimit,
      }),
  };
}

const rows = <T = Record<string, unknown>>(db: AppDatabase, query: string): T[] => db.all<T>(sql.raw(query));

function setup() {
  const server = createTestServer(['u1', 'u2']);
  // 端末の時計は大きくずれている(B は A より 1 日遅れ)。順序の判断に使われないことも確認する
  const a = createDevice('a', 'u1', 10 * DAY);
  const b = createDevice('b', 'u1', 9 * DAY);
  return { server, a, b, ca: server.connect('u1'), cb: server.connect('u1') };
}

describe('初回同期と2台目への取得', () => {
  it('学習データ一式をアップロードし、2台目がすべて取得する', async () => {
    const { a, b, ca, cb } = setup();
    const folder = a.repos.folders.create({ name: '英語' });
    const note = a.repos.notes.create({ folderId: folder.id, title: 'メモ', body: 'note-image://x.jpg' });
    const q = a.repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    a.repos.studySessions.record({ folderId: folder.id, startedAt: 0, endedAt: 60_000, durationSeconds: 60 });
    a.repos.review.applyRating({
      attemptId: 'att-1',
      questionId: q.id,
      rating: 'good',
      timedOut: false,
      elapsedMs: 5,
    });
    a.repos.settings.set('review.sessionSize', '30');
    a.repos.settings.set('notification.reminderTime', '09:00'); // 端末固有: 同期しない
    a.repos.goals.save({
      title: '合格',
      examDay: '2027-01-01',
      objective: 'o',
      purpose: 'p',
      actionPlan: 'plan',
    });

    const up = await a.sync(ca.transport);
    expect(up.pushed).toBeGreaterThan(0);
    expect(countPending(a.db)).toBe(0);

    await b.sync(cb.transport);
    expect(b.repos.folders.getById(folder.id)?.name).toBe('英語');
    expect(b.repos.notes.getById(note.id)?.body).toBe('note-image://x.jpg');
    expect(b.repos.questions.getById(q.id)?.prompt).toBe('Q');
    expect(b.repos.review.listHistory(q.id)).toHaveLength(1);
    expect(b.repos.review.getState(q.id)).toEqual(a.repos.review.getState(q.id));
    expect(b.repos.studySessions.listSince(0)).toHaveLength(1);
    expect(b.repos.settings.get('review.sessionSize')).toBe('30');
    expect(b.repos.settings.get('notification.reminderTime')).toBeUndefined();
    expect(b.repos.goals.getActive()?.actionPlan).toBe('plan');
    // 反映したデータは再送対象にならない
    expect(countPending(b.db)).toBe(0);
  });

  it('マイグレーション前から存在するデータも初回同期の対象になる', async () => {
    const { a, ca } = setup();
    // 同期が有効になる前に作られたデータ(ゲストから引き継いだデータ相当)
    const folder = a.repos.folders.create({ name: '既存' });
    a.repos.notes.create({ folderId: folder.id, title: '既存ノート' });
    expect(countPending(a.db)).toBe(0);
    const res = await a.sync(ca.transport);
    expect(res.pushed).toBe(2);
  });
});

describe('差分同期', () => {
  it('編集した分だけ送り、差分だけ取得する', async () => {
    const { a, b, ca, cb } = setup();
    const f = a.repos.folders.create({ name: 'F' });
    const n1 = a.repos.notes.create({ folderId: f.id, title: '1' });
    a.repos.notes.create({ folderId: f.id, title: '2' });
    await a.sync(ca.transport);
    await b.sync(cb.transport);

    a.tick();
    a.repos.notes.update(n1.id, { folderId: f.id, title: '1改', body: '本文' });
    expect(countPending(a.db)).toBe(1);
    const up = await a.sync(ca.transport);
    expect(up.pushed).toBe(1);
    const down = await b.sync(cb.transport);
    expect(down.pulled).toBe(1);
    expect(b.repos.notes.getById(n1.id)?.title).toBe('1改');
  });

  it('同じレコードを何度編集しても、未送信は1件にまとめて送る', async () => {
    const { a, ca } = setup();
    const n = a.repos.notes.create({ title: 'v1' });
    for (let i = 2; i < 6; i++) {
      a.tick();
      a.repos.notes.update(n.id, { folderId: null, title: `v${i}`, body: '' });
    }
    const up = await a.sync(ca.transport);
    expect(up.pushed).toBe(1);
  });

  it('2台で交互に編集しても内容が揃う(端末の時計がずれていても)', async () => {
    const { a, b, ca, cb } = setup();
    const n = a.repos.notes.create({ title: 'A作成' });
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    b.tick();
    b.repos.notes.update(n.id, { folderId: null, title: 'Bが編集', body: 'b' });
    await b.sync(cb.transport);
    await a.sync(ca.transport);
    expect(a.repos.notes.getById(n.id)?.title).toBe('Bが編集');
    expect(rows(a.db, 'select * from notes')).toHaveLength(1);
  });
});

describe('オフライン・中断・再送', () => {
  it('オフライン中の編集は保持され、接続が戻ると同期される', async () => {
    const { a, b, ca, cb } = setup();
    ca.faults.offline = true;
    const n = a.repos.notes.create({ title: 'オフライン作成' });
    await expect(a.sync(ca.transport)).rejects.toThrow('offline');
    expect(a.repos.notes.getById(n.id)?.title).toBe('オフライン作成');
    expect(countPending(a.db)).toBeGreaterThan(0);

    ca.faults.offline = false;
    await a.sync(ca.transport);
    expect(countPending(a.db)).toBe(0);
    await b.sync(cb.transport);
    expect(b.repos.notes.getById(n.id)?.title).toBe('オフライン作成');
  });

  it('応答が失われても、再送で重複せず、未送信を失わない', async () => {
    const { a, b, ca, cb, server } = setup();
    const n = a.repos.notes.create({ title: '一度だけ' });
    ca.faults.loseNextPushResponse = true;
    await expect(a.sync(ca.transport)).rejects.toThrow('response lost');
    // サーバーには反映済みだが、クライアントは確認できていないので未送信のまま
    expect(countPending(a.db)).toBeGreaterThan(0);
    await a.sync(ca.transport);
    expect(countPending(a.db)).toBe(0);
    const count = server.sqlite
      .prepare("select count(*) as n from sync_records where entity = 'notes'")
      .get() as {
      n: number;
    };
    expect(count.n).toBe(1);
    await b.sync(cb.transport);
    expect(b.repos.notes.list()).toHaveLength(1);
    expect(b.repos.notes.getById(n.id)).toBeDefined();
  });

  it('応答喪失後に他端末が更新していても、再送で巻き戻さない', async () => {
    const { a, b, ca, cb } = setup();
    const n = a.repos.notes.create({ title: 'v1' });
    ca.faults.loseNextPushResponse = true;
    await expect(a.sync(ca.transport)).rejects.toThrow();
    await b.sync(cb.transport);
    b.tick();
    b.repos.notes.update(n.id, { folderId: null, title: 'Bの更新', body: '' });
    await b.sync(cb.transport);
    await a.sync(ca.transport);
    expect(a.repos.notes.getById(n.id)?.title).toBe('Bの更新');
    expect(a.repos.notes.list()).toHaveLength(1); // 競合コピーも作られない
  });

  it('取得の途中で切断されても、カーソルは反映済みのページまで。再開すると続きから揃う', async () => {
    const { a, b, ca, cb } = setup();
    for (let i = 0; i < 5; i++) a.repos.notes.create({ title: `n${i}` });
    await a.sync(ca.transport);

    cb.faults.failPullAfter = 1; // 1ページ目だけ成功
    await expect(b.sync(cb.transport, { pullLimit: 2 })).rejects.toThrow('connection dropped');
    expect(b.repos.notes.list().length).toBe(2);
    expect(Number(getMeta(b.db, META.cursor))).toBeGreaterThan(0);

    cb.faults.failPullAfter = -1;
    await b.sync(cb.transport, { pullLimit: 2 });
    expect(b.repos.notes.list()).toHaveLength(5);
    expect(countPending(b.db)).toBe(0);
  });
});

describe('競合と削除', () => {
  async function shared() {
    const s = setup();
    const f = s.a.repos.folders.create({ name: 'F' });
    const n = s.a.repos.notes.create({ folderId: f.id, title: '元', body: '元の本文' });
    const q = s.a.repos.questions.create({ folderId: f.id, prompt: '問', answer: '答' });
    await s.a.sync(s.ca.transport);
    await s.b.sync(s.cb.transport);
    return { ...s, f, n, q };
  }

  it('同じノートを両端末で編集: 両方の内容が残り、競合コピーが分かる', async () => {
    const { a, b, ca, cb, n } = await shared();
    ca.faults.offline = true;
    cb.faults.offline = true;
    a.tick();
    a.repos.notes.update(n.id, { folderId: null, title: 'iPhone', body: 'A本文' });
    b.tick();
    b.repos.notes.update(n.id, { folderId: null, title: 'iPad', body: 'B本文' });
    ca.faults.offline = false;
    cb.faults.offline = false;

    await a.sync(ca.transport); // 先着
    const res = await b.sync(cb.transport); // 後着が採用され、先着は競合コピーに
    expect(res.conflicts).toBe(1);
    await a.sync(ca.transport);

    for (const d of [a, b]) {
      const notes = d.repos.notes.list();
      expect(notes).toHaveLength(2);
      const main = notes.find((x) => x.id === n.id)!;
      const copy = notes.find((x) => x.id !== n.id)!;
      expect(main.body).toBe('B本文');
      expect(copy.title).toBe('【競合コピー】iPhone');
      expect(copy.body).toBe('A本文');
    }
    expect(countPending(a.db) + countPending(b.db)).toBe(0);
  });

  it('同じ問題を両端末で編集: 競合コピーで保全され、フォルダー参照が維持される', async () => {
    const { a, b, ca, cb, q, f } = await shared();
    a.tick();
    a.repos.questions.update(q.id, { prompt: '問', answer: 'A案' });
    b.tick();
    b.repos.questions.update(q.id, { prompt: '問', answer: 'B案' });
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    await a.sync(ca.transport);
    const list = a.repos.questions.listByFolder(f.id);
    expect(list.map((x) => x.answer).sort()).toEqual(['A案', 'B案']);
    expect(list.every((x) => x.folderId === f.id)).toBe(true);
  });

  it('削除は他端末へ伝わる', async () => {
    const { a, b, ca, cb, n } = await shared();
    a.tick();
    a.repos.notes.softDelete(n.id);
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    expect(b.repos.notes.list()).toHaveLength(0);
    expect(b.repos.notes.getById(n.id)).toBeUndefined();
  });

  it('削除済みのノートを古い端末が編集して再送しても復活しない。編集内容は競合コピーに残る', async () => {
    const { a, b, ca, cb, n } = await shared();
    a.tick();
    a.repos.notes.softDelete(n.id);
    await a.sync(ca.transport);

    b.tick();
    b.repos.notes.update(n.id, { folderId: null, title: '古い端末の編集', body: '大事な内容' });
    await b.sync(cb.transport);
    await a.sync(ca.transport);

    for (const d of [a, b]) {
      expect(d.repos.notes.getById(n.id)).toBeUndefined();
      const live = d.repos.notes.list();
      expect(live).toHaveLength(1);
      expect(live[0]?.body).toBe('大事な内容');
      expect(live[0]?.title).toBe('【競合コピー】古い端末の編集');
    }
  });

  it('編集と削除が衝突: 削除を採用し、編集内容は競合コピーとして残る', async () => {
    const { a, b, ca, cb, n } = await shared();
    a.tick();
    a.repos.notes.update(n.id, { folderId: null, title: '元', body: '編集を先に送信' });
    await a.sync(ca.transport);
    b.tick();
    b.repos.notes.softDelete(n.id);
    await b.sync(cb.transport);
    await a.sync(ca.transport);
    for (const d of [a, b]) {
      expect(d.repos.notes.getById(n.id)).toBeUndefined();
      expect(d.repos.notes.list().map((x) => x.body)).toEqual(['編集を先に送信']);
    }
  });

  it('削除したフォルダーを古い端末の再アップロードで復活させない', async () => {
    const { a, b, ca, cb, f } = await shared();
    a.tick();
    a.repos.folders.softDelete(f.id);
    await a.sync(ca.transport);
    b.tick();
    b.repos.folders.rename(f.id, '古い名前');
    await b.sync(cb.transport);
    expect(b.repos.folders.getById(f.id)).toBeUndefined();
    expect(b.repos.folders.list()).toHaveLength(0);
  });

  it('復習履歴は両端末分が残り(和集合)、FSRS状態は新しい復習に揃う', async () => {
    const { a, b, ca, cb, q } = await shared();
    a.tick();
    a.repos.review.applyRating({
      attemptId: 'a-att',
      questionId: q.id,
      rating: 'good',
      timedOut: false,
      elapsedMs: null,
    });
    b.tick(5 * DAY);
    b.repos.review.applyRating({
      attemptId: 'b-att',
      questionId: q.id,
      rating: 'again',
      timedOut: false,
      elapsedMs: null,
    });
    await a.sync(ca.transport);
    await b.sync(cb.transport);
    await a.sync(ca.transport);
    for (const d of [a, b]) {
      expect(
        d.repos.review
          .listHistory(q.id)
          .map((h) => h.id)
          .sort(),
      ).toEqual(['a-att', 'b-att']);
    }
    expect(a.repos.review.getState(q.id)).toEqual(b.repos.review.getState(q.id));
    expect(a.repos.review.getState(q.id)?.lastReviewAt).toBe(
      b.repos.review.listHistory(q.id).at(-1)?.reviewedAt,
    );
  });
});

describe('アカウント分離と停止', () => {
  it('別アカウントのデータは取得できない', async () => {
    const server = createTestServer(['u1', 'u2']);
    const a = createDevice('a', 'u1', DAY);
    const other = createDevice('o', 'u2', DAY);
    a.repos.notes.create({ title: 'u1のノート' });
    await a.sync(server.connect('u1').transport);
    await other.sync(server.connect('u2').transport);
    expect(other.repos.notes.list()).toHaveLength(0);
  });

  it('別アカウントの応答は反映せず停止する', async () => {
    const server = createTestServer(['u1', 'u2']);
    const a = createDevice('a', 'u1', DAY);
    const other = createDevice('o', 'u2', DAY);
    other.repos.notes.create({ title: 'u2のノート' });
    await other.sync(server.connect('u2').transport);
    // u1 のDBに、u2 のセッションで接続してしまった状況
    await expect(a.sync(server.connect('u2').transport)).rejects.toBeInstanceOf(SyncStoppedError);
    expect(a.repos.notes.list()).toHaveLength(0);
  });

  it('DBの持ち主と異なるアカウントでは同期しない', async () => {
    const server = createTestServer(['u1', 'u2']);
    const a = createDevice('a', 'u1', DAY);
    await a.sync(server.connect('u1').transport);
    const wrong = runSync({
      db: a.db,
      transport: server.connect('u2').transport,
      userId: 'u2',
      now: () => DAY,
      newId: () => 'x',
      isActive: () => true,
    });
    await expect(wrong).rejects.toThrow();
  });

  it('停止(ログアウト)後は通信しない', async () => {
    const { a } = setup();
    a.repos.notes.create({ title: 'x' });
    const transport: SyncTransport = { push: jest.fn(), pull: jest.fn() };
    await expect(a.sync(transport, { isActive: () => false })).rejects.toBeInstanceOf(SyncStoppedError);
    expect(transport.push).not.toHaveBeenCalled();
    expect(transport.pull).not.toHaveBeenCalled();
    expect(a.repos.notes.list()).toHaveLength(1);
  });

  it('ゲストDB(同期を有効にしていないDB)は変更を記録せず、同期されない', () => {
    const guest = createDevice('g', 'guest', DAY);
    guest.repos.notes.create({ title: 'ゲストのノート' });
    guest.repos.settings.set('review.sessionSize', '10');
    expect(countPending(guest.db)).toBe(0);
    expect(rows(guest.db, 'select count(*) as n from sync_outbox')[0]).toEqual({ n: 0 });
  });
});

describe('マイグレーションと既存データの互換性', () => {
  it('0004 を適用しても既存データは変わらず、同期を有効にすると全件が送信対象になる', () => {
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
    ])
      apply(f);
    sqlite.exec(`INSERT INTO folders (id, created_at, updated_at, name) VALUES ('f1', 1, 1, '既存');
      INSERT INTO notes (id, created_at, updated_at, folder_id, title, body) VALUES ('n1', 1, 1, 'f1', 't', 'b');
      INSERT INTO settings (key, value, updated_at) VALUES ('review.sessionSize', '20', 1), ('timer.state', '{}', 1)`);
    const before = sqlite.prepare('select * from notes').all();

    apply('0004_sync_outbox.sql');
    expect(sqlite.prepare('select * from notes').all()).toEqual(before);
    expect(sqlite.prepare('select count(*) as n from sync_outbox').get()).toEqual({ n: 0 });
    // 有効化前の変更は記録されない(ゲストDBと同じ)
    sqlite.exec("UPDATE notes SET title = 'x' WHERE id = 'n1'");
    expect(sqlite.prepare('select count(*) as n from sync_outbox').get()).toEqual({ n: 0 });
    // 有効化すると、変更が同一トランザクションで記録される
    sqlite.exec("INSERT INTO sync_metadata (key, value, updated_at) VALUES ('sync.capture', '1', 1)");
    sqlite.exec("UPDATE notes SET title = 'y' WHERE id = 'n1'");
    sqlite.exec("UPDATE settings SET value = '{\"a\":1}' WHERE key = 'timer.state'");
    sqlite.exec("INSERT INTO settings (key, value, updated_at) VALUES ('review.x', '1', 2)");
    expect(sqlite.prepare('select entity, entity_id from sync_outbox order by seq').all()).toEqual([
      { entity: 'notes', entity_id: 'n1' },
      { entity: 'settings', entity_id: 'review.x' }, // timer.state は端末固有なので記録されない
    ]);
  });
});
