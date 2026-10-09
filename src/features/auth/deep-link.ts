/**
 * メール内リンクからアプリへ戻るときのパラメータ検証。
 *
 * - 受け付けるのは API の許可リスト(api/src/redirect-policy.ts)と同じ `verified` / `reset-password` のみ。
 * - セッションCookie・Bearer Token などの認証情報がURLに含まれていたら無視する(信用しない)。
 * - 再設定トークンは形式(英数字と `-` `_`、長さ上限)を満たすものだけ受け付ける。
 */
export type VerifiedLink = { kind: 'verified'; error: string | null };
export type ResetLink = { kind: 'reset'; token: string | null };

const FORBIDDEN_PARAMS = ['cookie', 'session_token', 'bearer', 'access_token'];
const TOKEN = /^[A-Za-z0-9._-]{8,512}$/;
const ERROR_CODE = /^[A-Za-z0-9_]{1,64}$/;

type Params = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

/** 認証情報らしきパラメータが付いたリンクは不正として扱う */
export function hasCredentialParams(params: Params): boolean {
  return FORBIDDEN_PARAMS.some((key) => params[key] !== undefined);
}

export function parseVerifiedLink(params: Params): VerifiedLink {
  if (hasCredentialParams(params)) return { kind: 'verified', error: 'invalid_link' };
  if (params.error === undefined) return { kind: 'verified', error: null };
  // 配列など文字列でない error は成功扱いにせず、失敗として扱う
  const error = single(params.error);
  return { kind: 'verified', error: error !== null && ERROR_CODE.test(error) ? error : 'invalid_link' };
}

export function parseResetLink(params: Params): ResetLink {
  if (hasCredentialParams(params)) return { kind: 'reset', token: null };
  const token = single(params.token);
  return { kind: 'reset', token: token !== null && TOKEN.test(token) ? token : null };
}
