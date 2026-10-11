import type { ObjectStore } from './service';

/** Cloudflare R2 のアダプター。バケットは非公開で、Worker(認証・所有者確認済み)経由でしか読み書きしない */
export function createR2Store(bucket: R2Bucket): ObjectStore {
  return {
    async put(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    },
    async head(key) {
      return (await bucket.head(key)) !== null;
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async deletePrefix(prefix) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor, limit: 500 });
        if (page.objects.length > 0) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    },
  };
}
