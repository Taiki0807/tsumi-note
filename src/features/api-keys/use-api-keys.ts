import { useCallback, useEffect, useMemo, useState } from 'react';

import { authClient } from '@/features/auth/auth-client';
import { useAuth } from '@/features/auth/auth-context';
import { readAuthConfig } from '@/features/auth/config';

import {
  createApiKeysApi,
  type ApiKeyInfo,
  type ApiKeyResult,
  type IssueOptions,
  type IssuedApiKey,
} from './api-keys-api';

export type ApiKeysState =
  { status: 'loading' } | { status: 'ready'; keys: ApiKeyInfo[] } | { status: 'error'; message: string };

/**
 * APIキーの一覧・発行・失効(Figma 16c〜16e)。ログイン中のアカウントのキーだけを扱う。
 * 平文のキーはここでも保持しない(発行の戻り値として呼び出し元の画面状態にだけ渡る)。
 */
export function useApiKeys() {
  const { state: auth } = useAuth();
  const signedIn = auth.status === 'signedIn';
  const api = useMemo(() => {
    const apiUrl = readAuthConfig().apiUrl;
    const client = authClient;
    if (!signedIn || !apiUrl || !client) return null;
    return createApiKeysApi({ baseUrl: apiUrl, getCookie: () => client.getCookie() });
  }, [signedIn]);

  const [state, setState] = useState<ApiKeysState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!api) return;
    const r = await api.list();
    setState(r.ok ? { status: 'ready', keys: r.data } : { status: 'error', message: r.message });
  }, [api]);

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.list().then((r) => {
      if (active)
        setState(r.ok ? { status: 'ready', keys: r.data } : { status: 'error', message: r.message });
    });
    return () => {
      active = false;
    };
  }, [api]);

  const issue = async (name: string, options: IssueOptions): Promise<ApiKeyResult<IssuedApiKey>> => {
    if (!api) return { ok: false, kind: 'session_invalid', message: 'ログインが必要です。' };
    const r = await api.issue(name.trim(), options);
    if (r.ok) await refresh();
    return r;
  };

  const revoke = async (id: string): Promise<ApiKeyResult<null>> => {
    if (!api) return { ok: false, kind: 'session_invalid', message: 'ログインが必要です。' };
    const r = await api.revoke(id);
    // Already gone on the server (revoked elsewhere): the list is stale either way.
    if (r.ok || r.kind === 'not_found') await refresh();
    return r;
  };

  return { available: api !== null, state, refresh, issue, revoke };
}
