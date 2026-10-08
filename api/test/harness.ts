import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { createApp } from '../src/app';
import { createAuth } from '../src/auth';
import * as schema from '../src/db/schema';
import type { EmailMessage } from '../src/email';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');

export const BASE = 'http://localhost:8787';
export const SECRET = 'test-secret-test-secret-test-secret-0123';

export function createHarness() {
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
    baseURL: BASE,
    appScheme: 'tsumi-note',
    isDevelopment: true,
    sendEmail: async (m) => {
      sent.push(m);
    },
  });
  const app = createApp(() => auth);

  let ipCounter = 0;
  /** 各リクエストに別のIPを割り当ててレート制限の干渉を避ける。ip を指定すると固定する */
  async function request(
    path: string,
    init: { body?: unknown; ip?: string; headers?: Record<string, string> } = {},
  ) {
    const ip = init.ip ?? `10.0.0.${++ipCounter}`;
    return app.request(`${BASE}${path}`, {
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

  return { sqlite, sent, request, lastLink };
}

export const EMAIL = 'learner@example.com';
export const PASSWORD = 'study-note-2026';

export async function signUp(
  h: ReturnType<typeof createHarness>,
  email = EMAIL,
  password = PASSWORD,
  ip?: string,
) {
  return h.request('/api/auth/sign-up/email', { body: { email, password, name: 'Learner' }, ip });
}
