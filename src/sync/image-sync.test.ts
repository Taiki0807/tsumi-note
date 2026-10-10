import { createHash } from 'node:crypto';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase } from '@/db/test-utils';

import { runSync, SyncStoppedError } from './engine';
import { SyncAuthError, SyncNetworkError } from './http-transport';
import {
  countImageBacklog,
  liveNoteBodies,
  pullImages,
  pushImages,
  readTransfers,
  type ImageBlobStore,
  type ImageSyncOptions,
  type ImageTransport,
} from './image-sync';
import { createTestServer } from './test-server';
import { createHttpImageTransport } from './http-image-transport';

const DAY = 86_400_000;
const sha = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const PNG = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, 2, 3]);
const ref = (name: string) => `![画像](note-image://${name})`;

function createDevice(prefix: string, userId: string) {
  const db = createTestDatabase();
  let n = 0;
  const repos = createRepositories({ db, now: () => 5 * DAY, newId: () => `${prefix}-${++n}` });
  /** 端末の画像ディレクトリ(アカウントごとに別。ここでは1アカウント分) */
  const files = new Map<string, Uint8Array>();
  const blobs: ImageBlobStore = {
    list: () => [...files.keys()],
    read: async (name) => files.get(name)!,
    writeNew: async (name, bytes) => {
      if (!files.has(name)) files.set(name, bytes.slice());
    },
  };
  let active = true;
  const imageOptions = (
    transport: ImageTransport,
    over: Partial<ImageSyncOptions> = {},
  ): ImageSyncOptions => ({
    db,
    files: blobs,
    transport,
    liveBodies: () => liveNoteBodies(db),
    sha256: sha,
    now: () => 5 * DAY,
    isActive: () => active,
    ...over,
  });
  return {
    db,
    repos,
    files,
    imageOptions,
    stop: () => (active = false),
    syncRecords: (transport: Parameters<typeof runSync>[0]['transport']) =>
      runSync({
        db,
        transport,
        userId,
        now: () => 5 * DAY,
        newId: () => `${prefix}-dev`,
        isActive: () => active,
      }),
  };
}

function setup() {
  const server = createTestServer(['u1', 'u2']);
  const a = createDevice('a', 'u1');
  const b = createDevice('b', 'u1');
  return {
    server,
    a,
    b,
    ca: server.connect('u1'),
    cb: server.connect('u1'),
    ia: server.connectImages('u1'),
    ib: server.connectImages('u1'),
  };
}

describe('端末間の画像同期', () => {
  it('端末Aで添付した画像が、ノートの同期後に端末Bでも同じ内容で表示できる', async () => {
    const { a, b, ca, cb, ia, ib, server } = setup();
    a.files.set('p1.png', PNG(1));
    const note = a.repos.notes.create({ title: 'n', body: `x ${ref('p1.png')}` });

    await pushImages(a.imageOptions(ia.transport)); // 画像が先
    await a.syncRecords(ca.transport);
    expect([...server.objects.keys()]).toHaveLength(1);

    await b.syncRecords(cb.transport);
    expect(b.repos.notes.getById(note.id)?.body).toContain('p1.png');
    expect(b.files.has('p1.png')).toBe(false); // ノート到着時点では未取得でも本文・参照は壊れない
    const summary = await pullImages(b.imageOptions(ib.transport));
    expect(summary.downloaded).toBe(1);
    expect(b.files.get('p1.png')).toEqual(PNG(1));
    expect(readTransfers(b.db).get('p1.png')?.state).toBe('uploaded');
  });

  it('同じ内容は再アップロードされない(同期の再実行・別名の同一画像)', async () => {
    const { a, ia, server } = setup();
    a.files.set('p1.png', PNG(1));
    a.files.set('p2.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: `${ref('p1.png')}${ref('p2.png')}` });
    const first = await pushImages(a.imageOptions(ia.transport));
    expect(first.uploaded).toBe(2);
    expect(server.objects.size).toBe(1);
    const again = await pushImages(a.imageOptions(ia.transport));
    expect(again.uploaded).toBe(0);
  });
});

describe('オフラインと失敗', () => {
  it('オフラインで追加した画像は端末に残り、オンライン復帰後にアップロードされる', async () => {
    const { a, ia, server } = setup();
    a.files.set('p1.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    ia.faults.offline = true;
    await expect(pushImages(a.imageOptions(ia.transport))).rejects.toBeInstanceOf(SyncNetworkError);
    expect(a.files.get('p1.png')).toEqual(PNG(1));
    expect(readTransfers(a.db).has('p1.png')).toBe(false); // R2保存前に「同期済み」にしない
    expect(countImageBacklog(a.imageOptions(ia.transport))).toBe(1);

    ia.faults.offline = false;
    const summary = await pushImages(a.imageOptions(ia.transport));
    expect(summary.uploaded).toBe(1);
    expect(server.objects.size).toBe(1);
    expect(countImageBacklog(a.imageOptions(ia.transport))).toBe(0);
  });

  it('アップロードが途中で失敗しても、ローカル画像を保持し、再試行で完了する', async () => {
    const { a, ia, server } = setup();
    a.files.set('p1.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    ia.faults.failNextUploads = 1;
    await expect(pushImages(a.imageOptions(ia.transport))).rejects.toThrow();
    expect(a.files.has('p1.png')).toBe(true);
    expect(server.objects.size).toBe(0);
    expect((await pushImages(a.imageOptions(ia.transport))).uploaded).toBe(1);
    expect(server.objects.size).toBe(1);
  });

  it('サーバーが拒否する画像(偽装ファイル)は rejected になり、ローカルは保持され再送されない', async () => {
    const { a, ia, server } = setup();
    a.files.set('fake.png', new TextEncoder().encode('<html>'));
    a.repos.notes.create({ title: 'n', body: ref('fake.png') });
    const first = await pushImages(a.imageOptions(ia.transport));
    expect(first.failed).toBe(1);
    expect(readTransfers(a.db).get('fake.png')?.state).toBe('rejected');
    expect(a.files.has('fake.png')).toBe(true);
    expect(server.objects.size).toBe(0);
    expect((await pushImages(a.imageOptions(ia.transport))).failed).toBe(0);
  });

  it('他端末のアップロード待ち(本体が未到着)は download_pending のまま、後で取得できる', async () => {
    const { a, b, ca, cb, ia, ib } = setup();
    a.files.set('p1.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    await a.syncRecords(ca.transport); // ノートだけ先に届いた(画像は未アップロード)
    await b.syncRecords(cb.transport);
    const waiting = await pullImages(b.imageOptions(ib.transport));
    expect(waiting.waiting).toBe(1);
    expect(readTransfers(b.db).get('p1.png')?.state).toBe('download_pending');
    expect(b.repos.notes.list()).toHaveLength(1);

    await pushImages(a.imageOptions(ia.transport));
    expect((await pullImages(b.imageOptions(ib.transport))).downloaded).toBe(1);
    expect(b.files.get('p1.png')).toEqual(PNG(1));
  });

  it('壊れた画像(ハッシュ不一致)は保存せず、取得済みにしない', async () => {
    const { b, ib } = setup();
    b.repos.notes.create({ title: 'n', body: ref('p1.png') });
    const bad: ImageTransport = {
      ...ib.transport,
      download: async () => ({ bytes: PNG(9), sha256: 'f'.repeat(64) }),
    };
    const summary = await pullImages(b.imageOptions(bad));
    expect(summary.failed).toBe(1);
    expect(b.files.has('p1.png')).toBe(false);
    expect(readTransfers(b.db).get('p1.png')?.state).toBe('download_failed');
  });

  it('再インストール相当(ノートはあるが画像が無い端末)でも、再ログイン後に画像を復元できる', async () => {
    const { a, b, ca, cb, ia, ib } = setup();
    a.files.set('p1.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    await pushImages(a.imageOptions(ia.transport));
    await a.syncRecords(ca.transport);
    await b.syncRecords(cb.transport);
    expect(b.files.size).toBe(0);
    await pullImages(b.imageOptions(ib.transport));
    expect(b.files.get('p1.png')).toEqual(PNG(1));
  });

  it('同期の停止(ログアウト・アカウント切替)後は通信しない', async () => {
    const { a, ia, server } = setup();
    a.files.set('p1.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    a.repos.notes.create({ title: 'm', body: ref('p2.png') }); // 端末に無い画像(取得が必要)
    a.stop();
    await expect(pushImages(a.imageOptions(ia.transport))).rejects.toBeInstanceOf(SyncStoppedError);
    await expect(pullImages(a.imageOptions(ia.transport))).rejects.toBeInstanceOf(SyncStoppedError);
    expect(server.objects.size).toBe(0);
    expect(a.files.has('p1.png')).toBe(true);
  });

  it('認証切れは再ログインが必要なエラーとして伝わり、画像は保持される', async () => {
    const { a } = setup();
    a.files.set('p1.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    const expired: ImageTransport = {
      upload: async () => {
        throw new SyncAuthError('expired');
      },
      download: async () => null,
      remove: async () => 'absent',
    };
    await expect(pushImages(a.imageOptions(expired))).rejects.toBeInstanceOf(SyncAuthError);
    expect(a.files.has('p1.png')).toBe(true);
  });
});

describe('アカウント分離', () => {
  it('アカウントBはアカウントAの画像を取得できず、混在しない', async () => {
    const server = createTestServer(['u1', 'u2']);
    const a = createDevice('a', 'u1');
    const b = createDevice('b', 'u2');
    a.files.set('p1.png', PNG(1));
    a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    await pushImages(a.imageOptions(server.connectImages('u1').transport));

    // B のノートが偶然(または悪意で)同じ参照を持っていても、A の画像は取得できない
    b.repos.notes.create({ title: 'n', body: ref('p1.png') });
    const summary = await pullImages(b.imageOptions(server.connectImages('u2').transport));
    expect(summary.downloaded).toBe(0);
    expect(summary.waiting).toBe(1);
    expect(b.files.size).toBe(0);
  });
});

describe('削除', () => {
  async function synced() {
    const ctx = setup();
    const { a, b, ca, cb, ia, ib, server } = ctx;
    a.files.set('p1.png', PNG(1));
    const note = a.repos.notes.create({ title: 'n', body: ref('p1.png') });
    await pushImages(a.imageOptions(ia.transport));
    await a.syncRecords(ca.transport);
    await b.syncRecords(cb.transport);
    await pullImages(b.imageOptions(ib.transport));
    server.clock.now += 2 * DAY; // アップロード直後の猶予時間が過ぎた
    return { ...ctx, note };
  }

  it('画像を削除すると、他端末にも反映される(サーバーから消え、他端末でも不要になる)', async () => {
    const { a, b, ca, cb, ia, ib, server, note } = await synced();
    // A: ノートを削除 → 端末の画像を掃除 → サーバーへ削除を依頼
    a.repos.notes.softDelete(note.id);
    a.files.delete('p1.png');
    await a.syncRecords(ca.transport);
    expect((await pushImages(a.imageOptions(ia.transport))).removed).toBe(1);
    expect(server.objects.size).toBe(0);
    expect(readTransfers(a.db).has('p1.png')).toBe(false);

    // B: 削除を同期 → 参照が無くなった画像を掃除 → サーバーは既に削除済み(冪等)
    await b.syncRecords(cb.transport);
    expect(b.repos.notes.getById(note.id)).toBeUndefined();
    b.files.delete('p1.png');
    expect((await pushImages(b.imageOptions(ib.transport))).removed).toBe(1);
    expect(readTransfers(b.db).has('p1.png')).toBe(false);
  });

  it('他端末のノートがまだ参照している画像は、サーバーから削除されない', async () => {
    const { a, ia, server } = await synced();
    // A だけが参照を外し(ノートは未同期)、端末の画像を掃除した
    a.repos.notes.update('a-1', { title: 'n', body: '', folderId: null });
    a.files.delete('p1.png');
    const summary = await pushImages(a.imageOptions(ia.transport));
    expect(summary.removed).toBe(0);
    expect(server.objects.size).toBe(1);
    expect(readTransfers(a.db).get('p1.png')?.state).toBe('uploaded'); // 後で再確認する
  });

  it('未同期の画像(未アップロード)は、端末にある限り削除も上書きもされない', async () => {
    const { a, ia, server } = setup();
    a.files.set('draft.png', PNG(5));
    const summary = await pushImages(a.imageOptions(ia.transport)); // どのノートも参照していない
    expect(summary).toMatchObject({ uploaded: 0, removed: 0 });
    expect(a.files.get('draft.png')).toEqual(PNG(5));
    expect(server.objects.size).toBe(0);
  });

  it('削除済みノートの画像を参照していても、ノート側のデータは変わらない', async () => {
    const { a, note } = await synced();
    a.repos.notes.softDelete(note.id);
    expect(liveNoteBodies(a.db)).toEqual([]);
  });
});

describe('HTTPトランスポート', () => {
  const make = (status: number, body: BodyInit | null = null, headers: Record<string, string> = {}) =>
    createHttpImageTransport({
      baseUrl: 'https://api.test',
      getCookie: () => 'session=1',
      fetchImpl: (async () => new Response(body, { status, headers })) as typeof fetch,
    });

  it('ステータスを状態に対応づける', async () => {
    await expect(make(415).upload('a.png', PNG(1), 'x', 'image/png')).rejects.toMatchObject({ status: 415 });
    await expect(make(503).upload('a.png', PNG(1), 'x', 'image/png')).rejects.not.toMatchObject({
      status: 415,
    });
    expect(await make(404).download('a.png')).toBeNull();
    expect(await make(409).remove('a.png')).toBe('in_use');
    const ok = await make(200, PNG(1), { 'x-content-sha256': 'abc' }).download('a.png');
    expect(ok?.sha256).toBe('abc');
  });

  it('Cookie が無ければ通信せず再ログインを求める', async () => {
    const t = createHttpImageTransport({
      baseUrl: 'https://api.test',
      getCookie: () => '',
      fetchImpl: (async () => {
        throw new Error('should not be called');
      }) as typeof fetch,
    });
    await expect(t.download('a.png')).rejects.toBeInstanceOf(SyncAuthError);
  });
});
