/** ノート画像のアップロード検証。クライアントの申告(拡張子・Content-Type)は信用せず、実ファイルの先頭バイトで判定する。 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * 本文をストリームで読み、`limit` バイトを超えた時点で読み取りを中断して null を返す。
 * 超過分を含めて全量をメモリに載せない。Reader は必ずキャンセル/解放する。
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** アプリの `note-images.ts` と同じ名前規則(ランダムID + 拡張子) */
export const IMAGE_FILE_NAME = /^[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|gif|webp|heic|heif)$/i;

export type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic';

export const MIME_BY_KIND: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

const KIND_BY_EXTENSION: Record<string, ImageKind> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  heic: 'heic',
  heif: 'heic',
};

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** 先頭バイトから画像形式を判定する。対応外は undefined */
export function detectImageKind(b: Uint8Array): ImageKind | undefined {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a)
    return 'png';
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'gif';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(b, 8, 12))) return 'heic';
  return undefined;
}

export function kindFromFileName(fileName: string): ImageKind | undefined {
  if (!IMAGE_FILE_NAME.test(fileName)) return undefined;
  return KIND_BY_EXTENSION[fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()];
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class ImageError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 413 | 415 | 422 | 503,
    readonly code: string,
  ) {
    super(code);
  }
}

/** アップロードを検証して、サーバーが保存する形式・ハッシュを返す。失敗は ImageError */
export async function validateUpload(input: {
  fileName: string;
  declaredSha256: string | undefined;
  contentType: string | undefined;
  bytes: Uint8Array;
}): Promise<{ kind: ImageKind; sha256: string; contentType: string }> {
  const extKind = kindFromFileName(input.fileName);
  if (!extKind) throw new ImageError(400, 'invalid_file_name');
  if (input.bytes.length === 0) throw new ImageError(400, 'empty_body');
  if (input.bytes.length > MAX_IMAGE_BYTES) throw new ImageError(413, 'payload_too_large');
  const kind = detectImageKind(input.bytes);
  // 拡張子・実ファイル形式・申告Content-Type がすべて一致すること
  if (!kind || kind !== extKind) throw new ImageError(415, 'unsupported_image');
  const declared = input.contentType?.split(';')[0]?.trim().toLowerCase();
  if (declared && declared !== MIME_BY_KIND[kind]) throw new ImageError(415, 'content_type_mismatch');
  if (!input.declaredSha256 || !/^[0-9a-f]{64}$/.test(input.declaredSha256))
    throw new ImageError(400, 'invalid_sha256');
  const sha256 = await sha256Hex(input.bytes);
  if (sha256 !== input.declaredSha256) throw new ImageError(422, 'sha256_mismatch');
  return { kind, sha256, contentType: MIME_BY_KIND[kind] };
}
