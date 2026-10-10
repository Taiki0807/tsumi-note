import { sql } from 'drizzle-orm';

import { extractImageFiles } from '@/features/notes/note-images';

import { SyncStoppedError } from './engine';
import { SyncAuthError, SyncNetworkError } from './http-transport';
import type { Executor } from './local-store';

/**
 * ノート画像の同期(PHASE8_DESIGN §11)。D1の差分同期とは別に、ファイルごとの転送状態を
 * `image_transfers` で管理する。
 *
 * - 画像はまず端末に保存済み。アップロードの失敗・中断でローカルのファイルは変更も削除もしない。
 * - 「同期済み」(`uploaded`)にするのは、サーバーが R2 への保存成功を応答した後だけ。
 * - 順序: 画像のアップロード → D1の差分同期 → 画像のダウンロード。ノートの参照より先に本体がR2に届く。
 *   それでも他端末で本体が未到着なら 404 のまま `download_pending` にして、次回以降に再取得する。
 * - ローカルの画像の削除は、サーバーへ削除を依頼するだけで、サーバーが参照中と判断すれば拒否される。
 */
export type ImageTransport = {
  /** R2 への保存が成功したら解決する。サーバーが内容を拒否したら ImageRejectedError */
  upload(fileName: string, bytes: Uint8Array, sha256: string, mimeType: string): Promise<void>;
  /** 本体が無い(他端末のアップロード待ち・削除済み・他人の画像)ときは null */
  download(fileName: string): Promise<{ bytes: Uint8Array; sha256: string } | null>;
  remove(fileName: string): Promise<'deleted' | 'absent' | 'in_use'>;
};

/** サーバーが画像を受け付けない(形式・サイズ・同名別内容)。再送しても成功しない */
export class ImageRejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** アプリの画像ディレクトリ(アカウントごとに分離済み)の読み書き */
export type ImageBlobStore = {
  list(): string[];
  read(fileName: string): Promise<Uint8Array>;
  /** 既存の名前は上書きしない。途中で失敗しても、完成していないファイルを名前として残さない */
  writeNew(fileName: string, bytes: Uint8Array): Promise<void>;
};

export type ImageSyncOptions = {
  db: Executor;
  files: ImageBlobStore;
  transport: ImageTransport;
  /** 削除されていないノートの本文 */
  liveBodies: () => string[];
  sha256: (bytes: Uint8Array) => Promise<string>;
  now: () => number;
  isActive: () => boolean;
  /** 1回の同期で転送する最大ファイル数(残りは次回) */
  batchSize?: number;
};

export type ImageSyncSummary = {
  uploaded: number;
  downloaded: number;
  removed: number;
  /** 転送に失敗した(次回再試行する)ファイル数。ローカルのファイルは保持される */
  failed: number;
  /** 他端末のアップロード待ちなどで、まだ取得できないファイル数 */
  waiting: number;
};

const BATCH = 20;

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
};

export const mimeTypeOf = (fileName: string) =>
  MIME[fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

export type TransferState =
  'uploaded' | 'upload_failed' | 'download_pending' | 'download_failed' | 'rejected';

type TransferRow = { file_name: string; state: TransferState; attempts: number };

export function readTransfers(db: Executor): Map<string, { state: TransferState; attempts: number }> {
  const rows = db.all<TransferRow>(sql`SELECT file_name, state, attempts FROM image_transfers`);
  return new Map(rows.map((r) => [r.file_name, { state: r.state, attempts: r.attempts }]));
}

function writeTransfer(
  db: Executor,
  fileName: string,
  state: TransferState,
  now: number,
  extra: { sha256?: string | null; error?: string | null; attempts?: number } = {},
): void {
  db.run(
    sql`INSERT INTO image_transfers (file_name, sha256, state, attempts, last_error, updated_at)
        VALUES (${fileName}, ${extra.sha256 ?? null}, ${state}, ${extra.attempts ?? 0}, ${extra.error ?? null}, ${now})
        ON CONFLICT (file_name) DO UPDATE SET
          sha256 = COALESCE(excluded.sha256, image_transfers.sha256), state = excluded.state,
          attempts = excluded.attempts, last_error = excluded.last_error, updated_at = excluded.updated_at`,
  );
}

function clearTransfer(db: Executor, fileName: string): void {
  db.run(sql`DELETE FROM image_transfers WHERE file_name = ${fileName}`);
}

/** 削除されていないノートの本文(画像を参照している可能性があるもの) */
export function liveNoteBodies(db: Executor): string[] {
  return db
    .all<{ body: string }>(
      sql`SELECT body FROM notes WHERE deleted_at IS NULL AND body LIKE '%note-image://%'`,
    )
    .map((r) => r.body);
}

function referencedFiles(opts: ImageSyncOptions): Set<string> {
  return new Set(opts.liveBodies().flatMap(extractImageFiles));
}

function checkActive(opts: ImageSyncOptions) {
  if (!opts.isActive()) throw new SyncStoppedError('同期は停止されました');
}

/** 続行できない(再ログイン・停止・通信不可)。ファイル単位の失敗とは区別して呼び出し側へ伝える */
const isFatal = (e: unknown) =>
  e instanceof SyncAuthError || e instanceof SyncStoppedError || e instanceof SyncNetworkError;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : '転送に失敗しました').slice(0, 200);

/** 未アップロードの画像を送り、不要になったサーバー上の画像の削除を依頼する */
export async function pushImages(opts: ImageSyncOptions): Promise<ImageSyncSummary> {
  const summary: ImageSyncSummary = { uploaded: 0, downloaded: 0, removed: 0, failed: 0, waiting: 0 };
  const limit = opts.batchSize ?? BATCH;
  const referenced = referencedFiles(opts);
  const local = new Set(opts.files.list());
  const transfers = readTransfers(opts.db);

  // ノートが参照している端末内の画像のうち、まだサーバーに保存されていないもの
  const todo = [...referenced].filter((name) => {
    const t = transfers.get(name);
    return local.has(name) && t?.state !== 'uploaded' && t?.state !== 'rejected';
  });
  for (const name of todo.slice(0, limit)) {
    checkActive(opts);
    const attempts = (transfers.get(name)?.attempts ?? 0) + 1;
    try {
      const bytes = await opts.files.read(name);
      const sha256 = await opts.sha256(bytes);
      await opts.transport.upload(name, bytes, sha256, mimeTypeOf(name));
      // サーバーが R2 保存の成功を応答した後にだけ「同期済み」にする
      writeTransfer(opts.db, name, 'uploaded', opts.now(), { sha256 });
      summary.uploaded++;
    } catch (e) {
      if (isFatal(e)) throw e;
      writeTransfer(
        opts.db,
        name,
        e instanceof ImageRejectedError ? 'rejected' : 'upload_failed',
        opts.now(),
        {
          attempts,
          error: messageOf(e),
        },
      );
      summary.failed++;
    }
  }

  // 端末から消えて、どのノートも参照していない画像: サーバーへ削除を依頼する(参照中ならサーバーが拒否する)
  const gone = [...transfers]
    .filter(([name, t]) => t.state === 'uploaded' && !local.has(name) && !referenced.has(name))
    .map(([name]) => name);
  for (const name of gone.slice(0, limit)) {
    checkActive(opts);
    try {
      const result = await opts.transport.remove(name);
      if (result !== 'in_use') {
        clearTransfer(opts.db, name);
        summary.removed++;
      }
    } catch (e) {
      if (isFatal(e)) throw e;
      summary.failed++;
    }
  }
  return summary;
}

/** ノートが参照しているのに端末に無い画像を取得する */
export async function pullImages(opts: ImageSyncOptions): Promise<ImageSyncSummary> {
  const summary: ImageSyncSummary = { uploaded: 0, downloaded: 0, removed: 0, failed: 0, waiting: 0 };
  const limit = opts.batchSize ?? BATCH;
  const local = new Set(opts.files.list());
  const transfers = readTransfers(opts.db);
  const missing = [...referencedFiles(opts)].filter(
    (name) => !local.has(name) && transfers.get(name)?.state !== 'rejected',
  );
  for (const name of missing.slice(0, limit)) {
    checkActive(opts);
    const attempts = (transfers.get(name)?.attempts ?? 0) + 1;
    try {
      const found = await opts.transport.download(name);
      if (!found) {
        writeTransfer(opts.db, name, 'download_pending', opts.now(), { attempts });
        summary.waiting++;
        continue;
      }
      // 壊れた本体を保存して「取得済み」にしない
      if ((await opts.sha256(found.bytes)) !== found.sha256)
        throw new Error('取得した画像の整合性を確認できません');
      await opts.files.writeNew(name, found.bytes);
      writeTransfer(opts.db, name, 'uploaded', opts.now(), { sha256: found.sha256 });
      summary.downloaded++;
    } catch (e) {
      if (isFatal(e)) throw e;
      writeTransfer(opts.db, name, 'download_failed', opts.now(), { attempts, error: messageOf(e) });
      summary.failed++;
    }
  }
  summary.waiting += Math.max(0, missing.length - limit);
  return summary;
}

/** 転送待ちの画像数(端末にあって未アップロード + 参照されているが未取得) */
export function countImageBacklog(opts: Pick<ImageSyncOptions, 'db' | 'files' | 'liveBodies'>): number {
  const referenced = new Set(opts.liveBodies().flatMap(extractImageFiles));
  const local = new Set(opts.files.list());
  const transfers = readTransfers(opts.db);
  let n = 0;
  for (const name of referenced) {
    const state = transfers.get(name)?.state;
    if (state === 'rejected') continue;
    if (!local.has(name) || state !== 'uploaded') n++;
  }
  return n;
}
