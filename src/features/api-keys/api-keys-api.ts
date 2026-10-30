import { createAuthedRequest, SyncAuthError, SyncNetworkError } from '@/sync/http-transport';

/**
 * 外部サービス連携のAPIキー管理クライアント(`/v1/api-tokens`)。ログイン中のセッションCookieで認証し、
 * ユーザーIDはリクエストに載せない。平文のキーは発行の応答にしか含まれず、この層は保存もログ出力もしない。
 */
export type ApiKeyInfo = {
  id: string;
  name: string;
  /** 先頭の数文字だけ(例 `tsn_AbCdEf`)。一覧ではこれ以外を表示できない */
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** 権限。サーバーが未対応の古い応答では登録だけとみなす */
  scopes?: ApiKeyScope[];
  /** 有効期限(ms)。null / 未指定は無期限 */
  expiresAt?: number | null;
};

export type ApiKeyScope = 'study_sessions:write' | 'study_sessions:read';

/** Figma 16d 「有効期限」の選択肢(日数)。null は無期限 */
export const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: 30, label: '30日' },
  { days: 90, label: '90日' },
  { days: 365, label: '1年' },
  { days: null, label: '無期限' },
];
export const DEFAULT_EXPIRY_DAYS = 90;

export type IssueOptions = { scopes: ApiKeyScope[]; expiresInDays: number | null };

export type IssuedApiKey = ApiKeyInfo & {
  /** 平文のキー。発行直後の1回しか得られない */
  token: string;
};

export type ApiKeyFailureKind =
  | 'invalid_name'
  | 'invalid_options'
  | 'too_many_keys'
  | 'not_found'
  | 'session_invalid'
  | 'network'
  | 'unknown';

export type ApiKeyResult<T> = { ok: true; data: T } | { ok: false; kind: ApiKeyFailureKind; message: string };

export const MAX_API_KEY_NAME = 50;

const MESSAGES: Record<ApiKeyFailureKind, string> = {
  invalid_name: `名前は1〜${MAX_API_KEY_NAME}文字で入力してください。`,
  invalid_options: '権限または有効期限の指定が正しくありません。',
  too_many_keys: 'APIキーは5個まで発行できます。不要なキーを失効してから、もう一度お試しください。',
  not_found: 'このAPIキーはすでに失効しています。',
  session_invalid: 'ログインの有効期限が切れています。ログインし直してください。',
  network: '通信できませんでした。接続を確認して、もう一度お試しください。',
  unknown: '問題が発生しました。時間をおいてもう一度お試しください。',
};

function fail<T>(kind: ApiKeyFailureKind): ApiKeyResult<T> {
  return { ok: false, kind, message: MESSAGES[kind] };
}

type Options = {
  baseUrl: string;
  getCookie: () => Promise<string> | string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createApiKeysApi({ baseUrl, getCookie, fetchImpl = fetch, timeoutMs = 30_000 }: Options) {
  const send = createAuthedRequest({ baseUrl, getCookie, fetchImpl, timeoutMs });

  async function call(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ res: Response } | { kind: ApiKeyFailureKind }> {
    try {
      const res = await send(path, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { res };
    } catch (e) {
      if (e instanceof SyncAuthError) return { kind: 'session_invalid' };
      if (e instanceof SyncNetworkError) return { kind: 'network' };
      return { kind: 'unknown' };
    }
  }

  async function errorKind(res: Response): Promise<ApiKeyFailureKind> {
    let code: string | undefined;
    try {
      code = ((await res.json()) as { error?: string }).error;
    } catch {
      code = undefined;
    }
    if (code === 'invalid_name') return 'invalid_name';
    if (code === 'invalid_scopes' || code === 'invalid_expiry') return 'invalid_options';
    if (code === 'too_many_tokens') return 'too_many_keys';
    if (res.status === 404) return 'not_found';
    return 'unknown';
  }

  return {
    async list(): Promise<ApiKeyResult<ApiKeyInfo[]>> {
      const r = await call('GET', '/v1/api-tokens');
      if ('kind' in r) return fail(r.kind);
      if (!r.res.ok) return fail('unknown');
      try {
        const json = (await r.res.json()) as { tokens?: ApiKeyInfo[] };
        return { ok: true, data: json.tokens ?? [] };
      } catch {
        return fail('unknown');
      }
    },

    async issue(
      name: string,
      options: IssueOptions = { scopes: ['study_sessions:write'], expiresInDays: null },
    ): Promise<ApiKeyResult<IssuedApiKey>> {
      const r = await call('POST', '/v1/api-tokens', {
        name,
        scopes: options.scopes,
        expiresInDays: options.expiresInDays,
      });
      if ('kind' in r) return fail(r.kind);
      if (!r.res.ok) return fail(await errorKind(r.res));
      try {
        const json = (await r.res.json()) as IssuedApiKey;
        if (typeof json.token !== 'string' || !json.id) return fail('unknown');
        return { ok: true, data: json };
      } catch {
        return fail('unknown');
      }
    },

    async revoke(id: string): Promise<ApiKeyResult<null>> {
      const r = await call('DELETE', `/v1/api-tokens/${encodeURIComponent(id)}`);
      if ('kind' in r) return fail(r.kind);
      if (!r.res.ok) return fail(await errorKind(r.res));
      return { ok: true, data: null };
    },
  };
}

export type ApiKeysApi = ReturnType<typeof createApiKeysApi>;

/** 「作成 9/1 · 最終使用 3分前」(Figma 16c)。未使用なら「未使用」。 */
export function describeApiKeyUsage(key: Pick<ApiKeyInfo, 'createdAt' | 'lastUsedAt'>, now: number): string {
  const created = new Date(key.createdAt);
  const base = `作成 ${created.getMonth() + 1}/${created.getDate()}`;
  return `${base} · 最終使用 ${key.lastUsedAt === null ? '未使用' : formatAgo(now - key.lastUsedAt)}`;
}

function formatAgo(elapsedMs: number): string {
  const minutes = Math.floor(Math.max(0, elapsedMs) / 60_000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '昨日' : `${days}日前`;
}

/** 「読み取り · 書き込み · 期限 1/27」。期限切れは「期限切れ」。一覧の補足に使う */
export function describeApiKeyAccess(key: Pick<ApiKeyInfo, 'scopes' | 'expiresAt'>, now: number): string {
  const scopes = key.scopes ?? ['study_sessions:write'];
  const parts = [
    scopes.includes('study_sessions:write') ? '登録' : null,
    scopes.includes('study_sessions:read') ? '読み取り' : null,
  ].filter((p): p is string => p !== null);
  if (key.expiresAt != null) {
    if (key.expiresAt <= now) parts.push('期限切れ');
    else {
      const d = new Date(key.expiresAt);
      parts.push(`期限 ${d.getMonth() + 1}/${d.getDate()}`);
    }
  }
  return parts.join(' · ');
}

/** 一覧に出す伏せ字付きの表記(例 `tsn_AbCdEf••••`)。平文の残りは持たないので、これ以上は表示しない */
export function maskedApiKey(prefix: string): string {
  return `${prefix}••••`;
}
