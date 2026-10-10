import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { createApp } from '../src/app';
import { createAuth } from '../src/auth';
import * as schema from '../src/db/schema';
import type { EmailMessage } from '../src/email';
import type { ObjectStore } from '../src/images/service';
import type { SqlStatement, SyncDriver } from '../src/sync/service';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');

export const BASE = 'http://localhost:8787';
export const SECRET = 'test-secret-test-secret-test-secret-0123';

export function createHarness(
  opts: { environment?: string; baseURL?: string; universalLinkOrigin?: string } = {},
) {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  // 本番(D1)と同じ migrations/*.sql を適用して、スキーマのずれを検出する
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const stmt of readFileSync(join(MIGRATIONS_DIR, file), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) sqlite.run(stmt);
    }
  }

  const sent: EmailMessage[] = [];
  const db = drizzle(sqlite, { schema });
  const auth = createAuth({
    db,
    secret: SECRET,
    baseURL: opts.baseURL ?? BASE,
    appScheme: 'tsumi-note',
    environment: 'environment' in opts ? (opts.environment as string) : 'development',
    universalLinkOrigin: opts.universalLinkOrigin,
    sendEmail: async (m) => {
      sent.push(m);
    },
  });
  const objects = new Map<string, Uint8Array>();
  /** R2 の障害を再現する(アカウント削除の途中失敗のテスト用) */
  const faults: Faults = { deletePrefix: false, beforePut: null };
  const app = createApp(
    () => auth,
    () => bunDriver(sqlite),
    () => faultyStore(memoryStore(objects), faults),
  );

  let ipCounter = 0;
  /** 各リクエストに別のIPを割り当ててレート制限の干渉を避ける。ip を指定すると固定する */
  async function request(
    path: string,
    init: { body?: unknown; ip?: string; headers?: Record<string, string> } = {},
  ) {
    const ip = init.ip ?? `10.0.0.${++ipCounter}`;
    return app.request(`${opts.baseURL ?? BASE}${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'manual',
    } as RequestInit);
  }

  /** 直近メールからリンクを取り出す */
  function lastLink(): string {
    const m = sent.at(-1)?.text.match(/https?:\/\/\S+/);
    if (!m) throw new Error('メールにリンクがありません');
    return m[0];
  }

  /** 画像APIへのバイナリ要求(認証はCookie) */
  async function raw(
    path: string,
    init: { method: string; cookie?: string; body?: Uint8Array; headers?: Record<string, string> },
  ) {
    return app.request(`${opts.baseURL ?? BASE}${path}`, {
      method: init.method,
      headers: {
        'cf-connecting-ip': `10.1.0.${++ipCounter}`,
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
      body: init.body as unknown as BodyInit | undefined,
      redirect: 'manual',
    } as RequestInit);
  }

  return { sqlite, sent, request, raw, objects, lastLink, faults, app, baseURL: opts.baseURL ?? BASE };
}

type Faults = { deletePrefix: boolean; beforePut: Promise<void> | null };

function faultyStore(inner: ObjectStore, faults: Faults): ObjectStore {
  return {
    ...inner,
    /** beforePut が設定されていれば、解決するまで書き込みを止める(遅延・並行のテスト用) */
    async put(key, data, contentType) {
      if (faults.beforePut) await faults.beforePut;
      await inner.put(key, data, contentType);
    },
    async deletePrefix(prefix) {
      if (faults.deletePrefix) throw new Error('R2 unavailable');
      await inner.deletePrefix(prefix);
    },
  };
}

/** テスト用のR2代替(メモリ)。キーは本番と同じくサーバーが決めたものがそのまま入る */
export function memoryStore(objects: Map<string, Uint8Array>): ObjectStore {
  return {
    async put(key, data) {
      objects.set(key, data.slice());
    },
    async get(key) {
      return objects.get(key)?.slice() ?? null;
    },
    async head(key) {
      return objects.has(key);
    },
    async delete(key) {
      objects.delete(key);
    },
    async deletePrefix(prefix) {
      for (const key of [...objects.keys()]) if (key.startsWith(prefix)) objects.delete(key);
    },
  };
}

/** テスト用の同期ドライバー(bun:sqlite)。batch は1トランザクションで、本番D1と同じく全か無 */
export function bunDriver(sqlite: Database): SyncDriver {
  return {
    async all<T>(s: SqlStatement): Promise<T[]> {
      return sqlite.query(s.sql).all(...(s.params as never[])) as T[];
    },
    async batch(statements: SqlStatement[]): Promise<number[]> {
      const run = sqlite.transaction(() =>
        statements.map((s) => sqlite.query(s.sql).run(...(s.params as never[])).changes),
      );
      return run();
    },
  };
}

export const EMAIL = 'learner@example.com';
export const PASSWORD = 'study-note-2026';

/** 登録 → メール確認 → ログインして、セッションCookieを返す */
export async function registerAndLogin(h: ReturnType<typeof createHarness>, email: string): Promise<string> {
  await signUp(h, email);
  const link = new URL(h.lastLink());
  await h.request(`${link.pathname}${link.search}`);
  const login = await h.request('/api/auth/sign-in/email', { body: { email, password: PASSWORD } });
  return login.headers.get('set-cookie')!.split(';')[0]!;
}

export async function signUp(
  h: ReturnType<typeof createHarness>,
  email = EMAIL,
  password = PASSWORD,
  ip?: string,
) {
  return h.request('/api/auth/sign-up/email', { body: { email, password, name: 'Learner' }, ip });
}
