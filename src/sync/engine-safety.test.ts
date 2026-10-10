import { createRepositories } from '@/db/repositories';
import { createTestDatabase } from '@/db/test-utils';

import { runSync, SyncUpdateRequiredError, type SyncTransport } from './engine';
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
    sync: (transport: SyncTransport, pullLimit?: number) =>
      runSync({
        db,
        transport,
        userId,
        now: () => time,
        newId: () => `${prefix}-device`,
        isActive: () => true,
        pullLimit,
      }),
  };
}

async function shared() {
  const server = createTestServer(['u1']);
  const a = createDevice('a', 'u1', 10 * DAY);
  const b = createDevice('b', 'u1', 9 * DAY);
  const ca = server.connect('u1');
  const cb = server.connect('u1');
  const f = a.repos.folders.create({ name: 'F' });
  const n = a.repos.notes.create({ folderId: f.id, title: '元', body: '元の本文' });
  await a.sync(ca.transport);
  await b.sync(cb.transport);
  return { a, b, ca, cb, f, n };
}

/** push がサーバーで処理された直後(応答がクライアントへ届く前)に、ローカルの操作を差し込む */
function afterPush(base: SyncTransport, hooks: (() => void)[]): SyncTransport {
  return {
    ...base,
    async push(changes) {
      const res = await base.push(changes);
      hooks.shift()?.();
      return res;
    },
  };
}

describe('push 応答待ちの間のローカル変更', () => {
  /** 他端末が削除済みのノートを、この端末が編集して送る(superseded になる状況) */
  async function deletedOnServer() {
    const s = await shared();
    s.b.tick();
    s.b.repos.notes.softDelete(s.n.id);
    await s.b.sync(s.cb.transport);
    s.a.tick();
    return s;
  }

  it('送信中に同じノートを再編集しても、サーバーの削除で上書きせず、再編集の内容も競合コピーに残る', async () => {
    const { a, ca, f, n } = await deletedOnServer();
    a.repos.notes.update(n.id, { folderId: f.id, title: 'v1', body: '本文v1' });

    let calls = 0;
    const transport = afterPush(ca.transport, [
      () => {
        a.tick();
        a.repos.notes.update(n.id, { folderId: f.id, title: 'v2', body: '本文v2' });
      },
    ]);
    const wrapped: SyncTransport = {
      ...transport,
      push: (c) => {
        // 2回目の push(v2)の前に通信を失敗させ、中間状態を確認する
        if (++calls === 2) throw new Error('offline');
        return transport.push(c);
      },
    };
    await expect(a.sync(wrapped)).rejects.toThrow('offline');

    // 送信後の編集(v2)はローカルに残り、outbox にも残っている
    expect(a.repos.notes.getById(n.id)?.body).toBe('本文v2');
    expect(countPending(a.db)).toBe(1);

    // 通信失敗後の再試行で v2 も送られ、どちらの内容も競合コピーとして残る
    await a.sync(ca.transport);
    expect(a.repos.notes.getById(n.id)).toBeUndefined();
    expect(
      a.repos.notes
        .list()
        .map((x) => x.body)
        .sort(),
    ).toEqual(['本文v1', '本文v2']);
    expect(countPending(a.db)).toBe(0);
  });

  it('送信中に同じノートを削除した場合も、送信済みの内容(競合コピー)と削除が両方残る', async () => {
    const { a, b, ca, cb, f, n } = await deletedOnServer();
    a.repos.notes.update(n.id, { folderId: f.id, title: 'v1', body: '本文v1' });
    await a.sync(
      afterPush(ca.transport, [
        () => {
          a.tick();
          a.repos.notes.softDelete(n.id);
        },
      ]),
    );
    await b.sync(cb.transport);
    for (const d of [a, b]) {
      expect(d.repos.notes.getById(n.id)).toBeUndefined();
      expect(d.repos.notes.list().map((x) => x.body)).toEqual(['本文v1']);
    }
    expect(countPending(a.db)).toBe(0);
  });

  it('応答が失われても未同期本文は失われず、再送で保全される(応答の再処理)', async () => {
    const { a, ca, f, n } = await deletedOnServer();
    a.repos.notes.update(n.id, { folderId: f.id, title: 'v1', body: '本文v1' });
    const lose = afterPush(ca.transport, [
      () => {
        a.tick();
        a.repos.notes.update(n.id, { folderId: f.id, title: 'v2', body: '本文v2' });
        throw new Error('response lost');
      },
    ]);
    await expect(a.sync(lose)).rejects.toThrow('response lost');
    expect(a.repos.notes.getById(n.id)?.body).toBe('本文v2');
    expect(countPending(a.db)).toBe(1);

    await a.sync(ca.transport);
    await a.sync(ca.transport); // 再度の同期で増えない
    expect(
      a.repos.notes
        .list()
        .map((x) => x.body)
        .sort(),
    ).toEqual(['本文v1', '本文v2']);
  });

  it('後続の編集が無ければ、これまでどおりサーバーの削除を採用する', async () => {
    const { a, ca, f, n } = await deletedOnServer();
    a.repos.notes.update(n.id, { folderId: f.id, title: 'v1', body: '本文v1' });
    await a.sync(ca.transport);
    expect(a.repos.notes.getById(n.id)).toBeUndefined();
    expect(a.repos.notes.list().map((x) => x.body)).toEqual(['本文v1']);
  });
});

describe('未対応 entity と同期カーソル', () => {
  /** サーバーの応答の entity 名を書き換え、新しいアプリだけが理解する種別が届いた状況にする */
  function futureServer(base: SyncTransport, rename: Map<string, string>): SyncTransport {
    return {
      ...base,
      async pull(cursor, limit) {
        const res = await base.pull(cursor, limit);
        return { ...res, changes: res.changes.map((c) => ({ ...c, entity: rename.get(c.entity) ?? c.entity })) };
      },
    };
  }

  async function seeded() {
    const server = createTestServer(['u1']);
    const a = createDevice('a', 'u1', 10 * DAY);
    const b = createDevice('b', 'u1', 9 * DAY);
    const ca = server.connect('u1');
    const cb = server.connect('u1');
    const f = a.repos.folders.create({ name: 'F' });
    const n = a.repos.notes.create({ folderId: f.id, title: 'N', body: '本文' });
    await a.sync(ca.transport);
    return { a, b, cb, f, n };
  }

  it('既知 entity のみなら反映してカーソルを進める', async () => {
    const { b, cb, f } = await seeded();
    await b.sync(cb.transport);
    expect(b.repos.folders.getById(f.id)?.name).toBe('F');
    expect(Number(getMeta(b.db, META.cursor))).toBeGreaterThan(0);
  });

  it('未対応 entity のみ: 反映せず、カーソルも進めず、更新要求のエラーになる', async () => {
    const { b, cb, f } = await seeded();
    const t = futureServer(cb.transport, new Map([['folders', 'future_a'], ['notes', 'future_b']]));
    const err = await b.sync(t).catch((e) => e);
    expect(err).toBeInstanceOf(SyncUpdateRequiredError);
    expect(err.entities.sort()).toEqual(['future_a', 'future_b']);
    expect(getMeta(b.db, META.cursor)).toBeUndefined();
    expect(b.repos.folders.getById(f.id)).toBeUndefined();
  });

  it('既知と未対応が混在: ページ全体を反映せず、カーソルも維持する', async () => {
    const { b, cb, f, n } = await seeded();
    const t = futureServer(cb.transport, new Map([['notes', 'future_notes']]));
    await expect(b.sync(t)).rejects.toBeInstanceOf(SyncUpdateRequiredError);
    expect(getMeta(b.db, META.cursor)).toBeUndefined();
    expect(b.repos.folders.getById(f.id)).toBeUndefined();
    expect(b.repos.notes.getById(n.id)).toBeUndefined();
  });

  it('複数ページの途中で未対応が出現: それ以前のページは反映済み、カーソルは未対応ページの手前で止まる', async () => {
    const { b, cb, f, n } = await seeded();
    const t = futureServer(cb.transport, new Map([['notes', 'future_notes']]));
    await expect(b.sync(t, 1)).rejects.toBeInstanceOf(SyncUpdateRequiredError);
    expect(b.repos.folders.getById(f.id)?.name).toBe('F');
    expect(b.repos.notes.getById(n.id)).toBeUndefined();
    const cursor = Number(getMeta(b.db, META.cursor));
    expect(cursor).toBeGreaterThan(0);

    // アプリ更新後(同じ変更を再び取得できる): 取りこぼしなく反映される。再試行しても重複しない
    await b.sync(cb.transport, 1);
    await b.sync(cb.transport, 1);
    expect(b.repos.notes.getById(n.id)?.body).toBe('本文');
    expect(b.repos.notes.list()).toHaveLength(1);
    expect(countPending(b.db)).toBe(0);
  });
});
