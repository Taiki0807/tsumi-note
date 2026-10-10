import { createAuthedRequest, SyncServerError } from './http-transport';
import { ImageRejectedError, type ImageTransport } from './image-sync';

type Options = {
  baseUrl: string;
  getCookie: () => Promise<string> | string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * 画像API(`/v1/images/<fileName>`)のクライアント。R2の資格情報・オブジェクトキーは扱わない:
 * 画像の指定はファイル名だけで、所有者はサーバーがセッションから決める。
 */
export function createHttpImageTransport({
  baseUrl,
  getCookie,
  fetchImpl,
  timeoutMs = 60_000,
}: Options): ImageTransport {
  const send = createAuthedRequest({ baseUrl, getCookie, fetchImpl, timeoutMs });
  const path = (fileName: string) => `/v1/images/${encodeURIComponent(fileName)}`;

  return {
    async upload(fileName, bytes, sha256, mimeType) {
      const res = await send(path(fileName), {
        method: 'PUT',
        headers: { 'content-type': mimeType, 'x-content-sha256': sha256 },
        body: bytes,
      });
      if (res.ok) return;
      // 400系(形式・サイズ・同名別内容)は再送しても成功しない。5xx・429 は再試行できる失敗
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)
        throw new ImageRejectedError(`画像を保存できませんでした (${res.status})`, res.status);
      throw new SyncServerError(`画像のアップロードに失敗しました (${res.status})`, res.status);
    },

    async download(fileName) {
      const res = await send(path(fileName), { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok) throw new SyncServerError(`画像の取得に失敗しました (${res.status})`, res.status);
      const sha256 = res.headers.get('x-content-sha256');
      if (!sha256) throw new SyncServerError('サーバーの応答が不正です', res.status);
      return { bytes: new Uint8Array(await res.arrayBuffer()), sha256 };
    },

    async remove(fileName) {
      const res = await send(path(fileName), { method: 'DELETE' });
      if (res.status === 409) return 'in_use';
      if (!res.ok) throw new SyncServerError(`画像の削除に失敗しました (${res.status})`, res.status);
      const body = (await res.json()) as { result?: string };
      return body.result === 'deleted' ? 'deleted' : 'absent';
    },
  };
}
