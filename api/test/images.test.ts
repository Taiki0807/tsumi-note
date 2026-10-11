import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readBodyWithLimit } from '../src/images/validate';
import { createHarness, registerAndLogin } from './harness';

type H = ReturnType<typeof createHarness>;

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const png = (extra = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, extra]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);

async function put(h: H, cookie: string, name: string, bytes: Uint8Array, over: Record<string, string> = {}) {
  return h.raw(`/v1/images/${name}`, {
    method: 'PUT',
    cookie,
    body: bytes,
    headers: { 'x-content-sha256': sha(bytes), 'content-type': 'image/png', ...over },
  });
}
const get = (h: H, cookie: string | undefined, name: string) =>
  h.raw(`/v1/images/${name}`, { method: 'GET', cookie });
const del = (h: H, cookie: string, name: string) => h.raw(`/v1/images/${name}`, { method: 'DELETE', cookie });
const age = (h: H) => h.sqlite.run('UPDATE image_objects SET created_at = 0');

async function setup() {
  const h = createHarness();
  const a = await registerAndLogin(h, 'a@example.com');
  const b = await registerAndLogin(h, 'b@example.com');
  return { h, a, b };
}

describe('画像API: アップロード・取得', () => {
  test('アップロードした画像を別端末(同じアカウント)が同じバイト列で取得できる', async () => {
    const { h, a } = await setup();
    const bytes = png();
    const res = await put(h, a, 'img1.png', bytes);
    expect(res.status).toBe(200);
    const got = await get(h, a, 'img1.png');
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(got.headers.get('x-content-sha256')).toBe(sha(bytes));
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
  });

  test('キーはサーバーが決める(ユーザーID + sha256)', async () => {
    const { h, a } = await setup();
    const bytes = png();
    await put(h, a, 'img1.png', bytes);
    const keys = [...h.objects.keys()];
    expect(keys).toHaveLength(1);
    // アップロードごとに一意なキー(失敗・期限切れのキーを再利用しない)。内容のハッシュは含まない
    expect(keys[0]).toMatch(/^u\/[^/]+\/[0-9a-f-]{36}$/);
  });

  test('同じ内容は再アップロードされず(重複排除)、同じ操作の再送は冪等', async () => {
    const { h, a } = await setup();
    const bytes = png();
    await put(h, a, 'img1.png', bytes);
    const again = await put(h, a, 'img1.png', bytes);
    expect(again.status).toBe(200);
    const other = await put(h, a, 'img2.png', bytes);
    expect(((await other.json()) as any).deduplicated).toBe(true);
    expect(h.objects.size).toBe(1);
  });

  test('同名で別内容は拒否する(画像名は不変)', async () => {
    const { h, a } = await setup();
    await put(h, a, 'img1.png', png());
    expect((await put(h, a, 'img1.png', png(9))).status).toBe(409);
  });

  test('アップロード失敗(R2保存前の検証エラー)ではD1に行もR2オブジェクトも作らない', async () => {
    const { h, a } = await setup();
    await put(h, a, 'img1.png', png(), { 'x-content-sha256': 'a'.repeat(64) });
    expect(h.objects.size).toBe(0);
    expect(h.sqlite.query('SELECT COUNT(*) AS n FROM image_objects').get()).toEqual({ n: 0 });
  });
});

describe('画像API: 検証', () => {
  test('実ファイルが画像でなければ拒否(拡張子・Content-Typeを偽装しても)', async () => {
    const { h, a } = await setup();
    const html = new TextEncoder().encode('<script>alert(1)</script>');
    expect((await put(h, a, 'x.png', html)).status).toBe(415);
  });

  test('拡張子と実形式の不一致を拒否', async () => {
    const { h, a } = await setup();
    expect((await put(h, a, 'x.jpg', png())).status).toBe(415);
    expect((await put(h, a, 'x.jpg', jpeg(), { 'content-type': 'image/jpeg' })).status).toBe(200);
  });

  test('Content-Type が実形式と違えば拒否', async () => {
    const { h, a } = await setup();
    expect((await put(h, a, 'x.png', png(), { 'content-type': 'text/html' })).status).toBe(415);
  });

  test('sha256 が一致しない・無い場合は拒否', async () => {
    const { h, a } = await setup();
    expect((await put(h, a, 'x.png', png(), { 'x-content-sha256': 'b'.repeat(64) })).status).toBe(422);
    expect((await put(h, a, 'x.png', png(), { 'x-content-sha256': 'zz' })).status).toBe(400);
  });

  test('サイズ上限を超えると拒否', async () => {
    const { h, a } = await setup();
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect((await put(h, a, 'big.png', big)).status).toBe(413);
  });

  test('不正なファイル名(パス走査など)は拒否', async () => {
    const { h, a } = await setup();
    for (const name of ['..%2Fx.png', 'a%2Fb.png', 'x.svg', 'x.png%00.html', 'x']) {
      const res = await put(h, a, name, png());
      expect([400, 404]).toContain(res.status);
    }
    expect(h.objects.size).toBe(0);
  });
});

describe('画像API: アカウント分離・認証', () => {
  test('他アカウントの画像は取得できない(存在しない場合と同じ404)', async () => {
    const { h, a, b } = await setup();
    await put(h, a, 'img1.png', png());
    const asB = await get(h, b, 'img1.png');
    const missing = await get(h, b, 'nope.png');
    expect(asB.status).toBe(404);
    expect(await asB.text()).toBe(await missing.text());
  });

  test('他アカウントの画像は削除できず、本体も残る', async () => {
    const { h, a, b } = await setup();
    await put(h, a, 'img1.png', png());
    age(h);
    expect(((await (await del(h, b, 'img1.png')).json()) as any).result).toBe('absent');
    expect((await get(h, a, 'img1.png')).status).toBe(200);
  });

  test('同じ内容でもアカウントごとに別オブジェクト', async () => {
    const { h, a, b } = await setup();
    await put(h, a, 'img1.png', png());
    await put(h, b, 'img1.png', png());
    expect(h.objects.size).toBe(2);
  });

  test('未ログイン・偽造Cookieは拒否', async () => {
    const { h } = await setup();
    expect((await get(h, undefined, 'img1.png')).status).toBe(401);
    expect((await get(h, 'better-auth.session_token=forged', 'img1.png')).status).toBe(401);
    const bytes = png();
    expect((await h.raw('/v1/images/x.png', { method: 'PUT', body: bytes })).status).toBe(401);
    expect(h.objects.size).toBe(0);
  });

  test('クライアントが渡したキー・ユーザーIDは使われない', async () => {
    const { h, a, b } = await setup();
    await put(h, a, 'img1.png', png());
    const res = await h.raw('/v1/images/img1.png?userId=other&key=u/x/y', { method: 'GET', cookie: b });
    expect(res.status).toBe(404);
  });
});

describe('画像API: 削除', () => {
  const noteWith = (name: string, deleted: number | null = null) => ({
    entity: 'notes',
    id: `note-${name}`,
    opId: `op-${name}-${deleted}`,
    baseSeq: null,
    data: {
      folder_id: null,
      title: 't',
      body: `![画像](note-image://${name})`,
      pinned: 0,
      created_at: 1,
      updated_at: 1,
      deleted_at: deleted,
    },
  });

  test('アップロード直後は削除できない(参照ノートの同期待ち)', async () => {
    const { h, a } = await setup();
    await put(h, a, 'img1.png', png());
    expect((await del(h, a, 'img1.png')).status).toBe(409);
    expect((await get(h, a, 'img1.png')).status).toBe(200);
  });

  test('有効なノートが参照している間は削除できない', async () => {
    const { h, a } = await setup();
    await put(h, a, 'img1.png', png());
    age(h);
    await h.request('/v1/sync/push', { body: { changes: [noteWith('img1.png')] }, headers: { cookie: a } });
    const res = await del(h, a, 'img1.png');
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe('in_use');
    expect((await get(h, a, 'img1.png')).status).toBe(200);
  });

  test('参照が無くなれば削除でき、別端末の取得は404になる。再削除は冪等', async () => {
    const { h, a } = await setup();
    await put(h, a, 'img1.png', png());
    age(h);
    await h.request('/v1/sync/push', {
      body: { changes: [noteWith('img1.png', 5)] },
      headers: { cookie: a },
    });
    expect(((await (await del(h, a, 'img1.png')).json()) as any).result).toBe('deleted');
    expect(h.objects.size).toBe(0);
    expect((await get(h, a, 'img1.png')).status).toBe(404);
    expect(((await (await del(h, a, 'img1.png')).json()) as any).result).toBe('absent');
  });

  test('同じ内容を別名が使っている間はR2の本体を残す', async () => {
    const { h, a } = await setup();
    await put(h, a, 'img1.png', png());
    await put(h, a, 'img2.png', png());
    age(h);
    await del(h, a, 'img1.png');
    expect(h.objects.size).toBe(1);
    expect((await get(h, a, 'img2.png')).status).toBe(200);
    await del(h, a, 'img2.png');
    expect(h.objects.size).toBe(0);
  });
});

describe('画像API: 本文のストリーム読み取り', () => {
  const LIMIT = 15 * 1024 * 1024;
  const chunked = (sizes: number[]) => {
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i >= sizes.length) return controller.close();
        controller.enqueue(new Uint8Array(sizes[i++]!).fill(1));
      },
    });
  };

  test('上限以下の本文は全量を返す(Content-Length 不要)', async () => {
    const out = await readBodyWithLimit(chunked([1000, 2000, 3000]), LIMIT);
    expect(out?.length).toBe(6000);
  });

  test('ちょうど上限は許可し、1バイト超過は null', async () => {
    expect((await readBodyWithLimit(chunked([LIMIT]), LIMIT))?.length).toBe(LIMIT);
    expect(await readBodyWithLimit(chunked([LIMIT, 1]), LIMIT)).toBeNull();
  });

  test('超過した時点で読み取りを中断し、残りを読まずストリームをキャンセルする', async () => {
    let cancelled = false;
    let produced = 0;
    const endless = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          produced++;
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    expect(await readBodyWithLimit(endless, LIMIT)).toBeNull();
    expect(cancelled).toBe(true);
    expect(produced).toBeLessThanOrEqual(17); // 終わらない本文でも上限直後に止まる
  });

  test('本文なしは空', async () => {
    expect((await readBodyWithLimit(null, LIMIT))?.length).toBe(0);
  });

  test('15MiB 超は Content-Length が実サイズより小さくても 413(正常な画像は 200)', async () => {
    const { h, a } = await setup();
    expect((await put(h, a, 'ok.png', png())).status).toBe(200);
    const big = new Uint8Array(LIMIT + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await put(h, a, 'big.png', big, { 'content-length': '100' });
    expect(res.status).toBe(413);
    expect(h.objects.size).toBe(1);
  });
});
