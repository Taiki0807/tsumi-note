import { classifyError, createAuthApi, redirectUrls, type AuthClientLike } from './auth-api';

type Call = { name: string; input: unknown };

function fakeClient(
  respond: (name: string) => { data?: unknown; error?: unknown } | Error = () => ({ data: {} }),
) {
  const calls: Call[] = [];
  const make = (name: string) => async (input?: unknown) => {
    calls.push({ name, input });
    const r = respond(name);
    if (r instanceof Error) throw r;
    return { data: r.data ?? null, error: (r.error ?? null) as never };
  };
  const client = {
    signUp: { email: make('signUp') },
    signIn: { email: make('signIn'), social: make('social') },
    sendVerificationEmail: make('sendVerificationEmail'),
    requestPasswordReset: make('requestPasswordReset'),
    resetPassword: make('resetPassword'),
    signOut: make('signOut'),
  } as unknown as AuthClientLike;
  return { client, calls };
}

describe('redirectUrls', () => {
  it('APIの許可リストと完全一致する形式(クエリ・パス追加なし)', () => {
    expect(redirectUrls('tsumi-note')).toEqual({
      verified: 'tsumi-note://verified',
      resetPassword: 'tsumi-note://reset-password',
    });
  });
});

describe('classifyError', () => {
  it('APIのエラーを分類する', () => {
    expect(classifyError({ status: 403, code: 'EMAIL_NOT_VERIFIED' })).toBe('email_not_verified');
    expect(classifyError({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('invalid_credentials');
    expect(classifyError({ status: 429 })).toBe('rate_limited');
    expect(classifyError({ status: 400, code: 'INVALID_TOKEN' })).toBe('invalid_token');
    expect(classifyError({ status: 400, message: 'x' })).toBe('validation');
    expect(classifyError({ status: 0 })).toBe('network');
    expect(classifyError({})).toBe('network');
    expect(classifyError({ status: 500 })).toBe('unknown');
  });
});

describe('createAuthApi', () => {
  it('登録時にメール確認後の戻り先(固定のdeep link)を渡す', async () => {
    const { client, calls } = fakeClient();
    const result = await createAuthApi(client, 'tsumi-note').signUp('a@example.com', 'study-note-2026');
    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual({
      name: 'signUp',
      input: {
        email: 'a@example.com',
        password: 'study-note-2026',
        name: 'a',
        callbackURL: 'tsumi-note://verified',
      },
    });
  });

  it('メール未確認のログインは email_not_verified として返す', async () => {
    const { client } = fakeClient(() => ({ error: { status: 403, code: 'EMAIL_NOT_VERIFIED' } }));
    const result = await createAuthApi(client, 'tsumi-note').signIn('a@example.com', 'x');
    expect(result).toMatchObject({ ok: false, kind: 'email_not_verified' });
  });

  it('資格情報エラーは存在有無を区別しない同一メッセージ', async () => {
    const { client: c1 } = fakeClient(() => ({ error: { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' } }));
    const { client: c2 } = fakeClient(() => ({ error: { status: 401, code: 'USER_NOT_FOUND' } }));
    const r1 = await createAuthApi(c1, 'tsumi-note').signIn('a@example.com', 'x');
    const r2 = await createAuthApi(c2, 'tsumi-note').signIn('b@example.com', 'x');
    expect(r1).toEqual(r2);
  });

  it('通信失敗(例外)は network。学習データが端末に保存されている旨を伝える', async () => {
    const { client } = fakeClient(() => new Error('Network request failed'));
    const result = await createAuthApi(client, 'tsumi-note').signIn('a@example.com', 'x');
    expect(result).toMatchObject({ ok: false, kind: 'network' });
    if (!result.ok) expect(result.message).toContain('端末に保存');
  });

  it('レート制限は rate_limited', async () => {
    const { client } = fakeClient(() => ({ error: { status: 429 } }));
    const result = await createAuthApi(client, 'tsumi-note').resendVerification('a@example.com');
    expect(result).toMatchObject({ ok: false, kind: 'rate_limited' });
  });

  it('再設定リンクの戻り先とトークンをそのまま渡す', async () => {
    const { client, calls } = fakeClient();
    const api = createAuthApi(client, 'tsumi-note');
    await api.requestPasswordReset('a@example.com');
    await api.resetPassword('token-12345678', 'new-password-2026');
    expect(calls[0]).toEqual({
      name: 'requestPasswordReset',
      input: { email: 'a@example.com', redirectTo: 'tsumi-note://reset-password' },
    });
    expect(calls[1]).toEqual({
      name: 'resetPassword',
      input: { token: 'token-12345678', newPassword: 'new-password-2026' },
    });
  });

  it('IDトークン方式のソーシャルログインにnonceを渡す', async () => {
    const { client, calls } = fakeClient();
    await createAuthApi(client, 'tsumi-note').signInWithIdToken('apple', 'jwt', 'nonce1');
    expect(calls[0]).toEqual({
      name: 'social',
      input: { provider: 'apple', idToken: { token: 'jwt', nonce: 'nonce1' } },
    });
  });

  it('クライアントが無い(APIのURL未設定)場合は unavailable で、通信しない', async () => {
    const api = createAuthApi(null, 'tsumi-note');
    expect(await api.signIn('a@example.com', 'x')).toMatchObject({ ok: false, kind: 'unavailable' });
    expect(await api.signOut()).toMatchObject({ ok: false, kind: 'unavailable' });
  });
});
