/**
 * アカウント情報の取得と削除のAPIクライアント。対象は常にセッション(Cookie)のユーザーで、
 * ユーザーIDはリクエストに載せない。削除はサーバーが完了を返すまで「成功」にしない。
 */
export type AccountInfo = {
  email: string;
  providers: string[];
  /** 削除が途中で止まっている(サーバーに削除依頼が残っている)。再試行で完了させる */
  deletionPending: boolean;
};

export type AccountFailureKind =
  | 'password_required'
  | 'invalid_password'
  | 'reauth_required'
  | 'rate_limited'
  | 'session_invalid'
  | 'incomplete'
  | 'network'
  | 'unknown';

export type AccountResult<T> =
  { ok: true; data: T } | { ok: false; kind: AccountFailureKind; message: string };

const MESSAGES: Record<AccountFailureKind, string> = {
  password_required: 'パスワードを入力してください。',
  invalid_password: 'パスワードが正しくありません。',
  reauth_required:
    '本人確認のため、一度ログアウトして、もう一度ログインしてから削除してください。端末のデータは削除されていません。',
  rate_limited: '試行回数が多すぎます。しばらく待ってからもう一度お試しください。',
  session_invalid:
    'ログインの有効期限が切れています。ログインし直してください。端末のデータは削除されていません。',
  incomplete:
    'アカウントの削除を完了できませんでした。データの一部が残っている可能性があります。もう一度お試しください。',
  network: '通信できませんでした。接続を確認して、もう一度お試しください。端末のデータは削除されていません。',
  unknown: '問題が発生しました。時間をおいてもう一度お試しください。',
};

function fail<T>(kind: AccountFailureKind): AccountResult<T> {
  return { ok: false, kind, message: MESSAGES[kind] };
}

type Options = {
  baseUrl: string;
  getCookie: () => Promise<string> | string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createAccountApi({ baseUrl, getCookie, fetchImpl = fetch, timeoutMs = 30_000 }: Options) {
  async function send(method: 'GET' | 'DELETE', body?: unknown): Promise<Response | null> {
    const cookie = await getCookie();
    if (!cookie) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${baseUrl}/v1/account`, {
        method,
        headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        signal: controller.signal,
      });
    } catch {
      throw new TypeError('network');
    } finally {
      clearTimeout(timer);
    }
  }

  async function errorCode(res: Response): Promise<string | undefined> {
    try {
      return ((await res.json()) as { error?: string }).error;
    } catch {
      return undefined;
    }
  }

  return {
    async fetchInfo(): Promise<AccountResult<AccountInfo>> {
      try {
        const res = await send('GET');
        if (!res || res.status === 401) return fail('session_invalid');
        if (!res.ok) return fail('unknown');
        const json = (await res.json()) as {
          email?: unknown;
          providers?: unknown;
          deletionPending?: unknown;
        };
        if (typeof json.email !== 'string' || !Array.isArray(json.providers)) return fail('unknown');
        return {
          ok: true,
          data: {
            email: json.email,
            providers: json.providers.filter((p): p is string => typeof p === 'string'),
            deletionPending: json.deletionPending === true,
          },
        };
      } catch (e) {
        return fail(e instanceof TypeError ? 'network' : 'unknown');
      }
    },

    /** 成功はサーバーが `deleted: true` を返したときだけ */
    async deleteAccount(password?: string): Promise<AccountResult<null>> {
      try {
        const res = await send('DELETE', { confirm: true, ...(password === undefined ? {} : { password }) });
        if (!res) return fail('session_invalid');
        if (res.ok) {
          const json = (await res.json().catch(() => null)) as { deleted?: unknown } | null;
          return json?.deleted === true ? { ok: true, data: null } : fail('incomplete');
        }
        const code = await errorCode(res);
        if (res.status === 429) return fail('rate_limited');
        if (res.status === 401) return fail('session_invalid');
        if (code === 'password_required' || code === 'invalid_password' || code === 'reauth_required') {
          return fail(code);
        }
        return fail(res.status >= 500 ? 'incomplete' : 'unknown');
      } catch (e) {
        return fail(e instanceof TypeError ? 'network' : 'unknown');
      }
    },
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;

/** ログイン方法の表示名 */
export function providerLabel(providerId: string): string {
  switch (providerId) {
    case 'credential':
      return 'メールアドレス';
    case 'apple':
      return 'Apple';
    case 'google':
      return 'Google';
    default:
      return providerId;
  }
}

/**
 * 削除の実行順序: サーバーでの削除が完了してから、この端末のアカウントデータの削除を予約し、サインアウトする。
 * サーバーが失敗したら、端末のデータにもセッションにも触れない(再試行できる)。
 */
export async function performAccountDeletion(deps: {
  api: Pick<AccountApi, 'deleteAccount'>;
  userId: string;
  password?: string;
  /** この端末のアカウント別DB・画像の削除を予約する(ゲストへ切り替わった後に実行される) */
  requestLocalPurge: (userId: string) => void;
  signOut: () => Promise<unknown>;
}): Promise<AccountResult<null>> {
  const result = await deps.api.deleteAccount(deps.password);
  if (!result.ok) return result;
  deps.requestLocalPurge(deps.userId);
  try {
    await deps.signOut();
  } catch {
    // サーバー側のセッションは削除済み。ローカルのセッション消去は signOut の事前処理で行われる
  }
  return result;
}
