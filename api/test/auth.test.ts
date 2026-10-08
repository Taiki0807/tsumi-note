import { describe, expect, test } from 'bun:test';
import { createEmailVerificationToken } from 'better-auth/api';
import { EMAIL, PASSWORD, SECRET, createHarness, signUp } from './harness';

/** メール内リンクを開く(GET)。Better Auth は callbackURL へ302する */
async function openLink(h: ReturnType<typeof createHarness>, link: string) {
  const u = new URL(link);
  return h.request(`${u.pathname}${u.search}`);
}

async function signIn(h: ReturnType<typeof createHarness>, password = PASSWORD, ip?: string) {
  return h.request('/api/auth/sign-in/email', { body: { email: EMAIL, password }, ip });
}

async function registerVerified(h: ReturnType<typeof createHarness>) {
  await signUp(h);
  await openLink(h, h.lastLink());
}

describe('メール+パスワード登録', () => {
  test('登録すると確認メールが送られ、確認前はログインできない', async () => {
    const h = createHarness();
    const res = await signUp(h);
    expect(res.status).toBe(200);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]?.to).toBe(EMAIL);
    expect(res.headers.get('set-cookie')).toBeNull(); // 確認前はセッションを発行しない

    const login = await signIn(h);
    expect(login.status).toBe(403);
    expect(login.headers.get('set-cookie')).toBeNull();
  });

  test('パスワードは平文で保存されない', async () => {
    const h = createHarness();
    await signUp(h);
    const row = h.sqlite.query('SELECT password FROM account').get() as { password: string };
    expect(row.password).toBeTruthy();
    expect(row.password).not.toContain(PASSWORD);
  });

  test('パスワードポリシー違反は拒否される', async () => {
    const h = createHarness();
    for (const password of ['short1', 'onlyletterslong', '1234567890123', 'learner-2026-abc']) {
      const res = await signUp(h, EMAIL, password);
      expect(res.status).toBe(400);
    }
    expect(h.sqlite.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 0 });
    expect(h.sent).toHaveLength(0);
  });

  test('登録済みメールでの再登録は応答が変わらず、新規ユーザーを作らない', async () => {
    const h = createHarness();
    const first = await signUp(h);
    const second = await signUp(h);
    expect(second.status).toBe(first.status);
    expect(h.sqlite.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 });
    // 本人にのみ通知される
    expect(h.sent.at(-1)?.to).toBe(EMAIL);
  });
});

describe('メール確認', () => {
  test('確認リンクを開くと確認済みになり、ログインしてセッションを復元できる', async () => {
    const h = createHarness();
    await signUp(h);
    const verify = await openLink(h, h.lastLink());
    expect([200, 302]).toContain(verify.status);
    expect(h.sqlite.query('SELECT email_verified AS v FROM user').get()).toEqual({ v: 1 });

    const login = await signIn(h);
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie');
    expect(cookie).toBeTruthy();

    const me = await h.request('/v1/me', { headers: { cookie: cookie!.split(';')[0]! } });
    expect(me.status).toBe(200);
  });

  test('期限切れの確認リンクは失敗し、確認済みにならない', async () => {
    const h = createHarness();
    await signUp(h);
    // 正規の署名鍵で、すでに有効期限が切れた確認トークンを作る
    const token = await createEmailVerificationToken(SECRET, EMAIL, undefined, -10);
    const res = await h.request(`/api/auth/verify-email?token=${token}&callbackURL=tsumi-note://verified`);
    const location = res.headers.get('location') ?? '';
    expect(res.status === 302 ? location : await res.text()).toMatch(/error|expired|invalid/i);
    expect(h.sqlite.query('SELECT email_verified AS v FROM user').get()).toEqual({ v: 0 });
  });

  test('改ざんされた確認トークンは拒否される', async () => {
    const h = createHarness();
    await signUp(h);
    const res = await h.request('/api/auth/verify-email?token=invalid.token.value');
    expect(res.status === 302 ? (res.headers.get('location') ?? '') : await res.text()).toMatch(
      /error|invalid/i,
    );
    expect(h.sqlite.query('SELECT email_verified AS v FROM user').get()).toEqual({ v: 0 });
  });

  test('確認メールを再送できるが、続けての再送は制限される', async () => {
    const h = createHarness();
    await signUp(h);
    const before = h.sent.length;
    const ip = '203.0.113.9';
    const first = await h.request('/api/auth/send-verification-email', { body: { email: EMAIL }, ip });
    expect(first.status).toBe(200);
    expect(h.sent.length).toBe(before + 1);
    const second = await h.request('/api/auth/send-verification-email', { body: { email: EMAIL }, ip });
    expect(second.status).toBe(429);
    expect(h.sent.length).toBe(before + 1);
  });
});

describe('ログイン', () => {
  test('誤ったパスワードは拒否され、短時間の試行回数は制限される', async () => {
    const h = createHarness();
    await registerVerified(h);
    const ip = '198.51.100.7';
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await signIn(h, 'wrong-password-1', ip)).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
    // 制限中は正しいパスワードでも通らない(ブルートフォース対策)
    expect((await signIn(h, PASSWORD, ip)).status).toBe(429);
  });

  test('ユーザー不在と誤パスワードで同じエラーを返す(列挙対策)', async () => {
    const h = createHarness();
    await registerVerified(h);
    const wrong = await signIn(h, 'wrong-password-1');
    const missing = await h.request('/api/auth/sign-in/email', {
      body: { email: 'nobody@example.com', password: 'wrong-password-1' },
    });
    expect(missing.status).toBe(wrong.status);
    expect(await missing.json()).toEqual(await wrong.json());
  });

  test('ログアウトするとセッションが無効になる', async () => {
    const h = createHarness();
    await registerVerified(h);
    const login = await signIn(h);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await h.request('/v1/me', { headers: { cookie } })).status).toBe(200);
    const out = await h.request('/api/auth/sign-out', { body: {}, headers: { cookie } });
    expect(out.status).toBe(200);
    expect((await h.request('/v1/me', { headers: { cookie } })).status).toBe(401);
  });
});

describe('パスワード再設定', () => {
  async function requestReset(h: ReturnType<typeof createHarness>, email = EMAIL, ip?: string) {
    return h.request('/api/auth/request-password-reset', {
      body: { email, redirectTo: 'tsumi-note://reset-password' },
      ip,
    });
  }

  test('再設定メールからパスワードを変更でき、旧パスワードは使えず既存セッションは失効する', async () => {
    const h = createHarness();
    await registerVerified(h);
    const old = await signIn(h);
    const oldCookie = old.headers.get('set-cookie')!.split(';')[0]!;

    expect((await requestReset(h)).status).toBe(200);
    const link = h.lastLink();
    // リンクは tsumi-note://reset-password?token=... へリダイレクトする
    const redirect = await openLink(h, link);
    const loc = redirect.headers.get('location') ?? '';
    expect(loc.startsWith('tsumi-note://reset-password')).toBe(true);
    const token = new URL(loc).searchParams.get('token')!;
    expect(token).toBeTruthy();

    const newPassword = 'brand-new-pass-77';
    const reset = await h.request('/api/auth/reset-password', { body: { token, newPassword } });
    expect(reset.status).toBe(200);

    expect((await signIn(h, PASSWORD)).status).toBe(401);
    expect((await signIn(h, newPassword)).status).toBe(200);
    expect((await h.request('/v1/me', { headers: { cookie: oldCookie } })).status).toBe(401);

    // トークンは使い回せない
    const again = await h.request('/api/auth/reset-password', {
      body: { token, newPassword: 'another-pass-88x' },
    });
    expect(again.status).toBe(400);
  });

  test('未登録メールでも同じ応答を返し、メールは送らない(列挙対策)', async () => {
    const h = createHarness();
    await registerVerified(h);
    const sentBefore = h.sent.length;
    const known = await requestReset(h);
    const unknown = await requestReset(h, 'nobody@example.com');
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(h.sent.length).toBe(sentBefore + 1);
  });

  test('期限切れの再設定トークンは使えない', async () => {
    const h = createHarness();
    await registerVerified(h);
    await requestReset(h);
    const token = new URL(h.lastLink()).pathname.split('/').pop()!;
    h.sqlite.run('UPDATE verification SET expires_at = 1');
    const res = await h.request('/api/auth/reset-password', {
      body: { token, newPassword: 'brand-new-pass-77' },
    });
    expect(res.status).toBe(400);
    expect((await signIn(h, 'brand-new-pass-77')).status).toBe(401);
  });

  test('再設定時にもパスワードポリシーが適用される', async () => {
    const h = createHarness();
    await registerVerified(h);
    await requestReset(h);
    const token = new URL(h.lastLink()).pathname.split('/').pop()!;
    const res = await h.request('/api/auth/reset-password', { body: { token, newPassword: 'weak' } });
    expect(res.status).toBe(400);
    expect((await signIn(h, PASSWORD)).status).toBe(200);
  });

  test('再設定メールの再送は制限される', async () => {
    const h = createHarness();
    await registerVerified(h);
    const ip = '192.0.2.50';
    expect((await requestReset(h, EMAIL, ip)).status).toBe(200);
    expect((await requestReset(h, EMAIL, ip)).status).toBe(429);
  });
});

describe('パスワード変更', () => {
  test('現在のパスワードを要求し、新しいパスワードにもポリシーを適用する', async () => {
    const h = createHarness();
    await registerVerified(h);
    const cookie = (await signIn(h)).headers.get('set-cookie')!.split(';')[0]!;
    const weak = await h.request('/api/auth/change-password', {
      body: { currentPassword: PASSWORD, newPassword: 'weak' },
      headers: { cookie },
    });
    expect(weak.status).toBe(400);
    const wrongCurrent = await h.request('/api/auth/change-password', {
      body: { currentPassword: 'not-my-password-1', newPassword: 'brand-new-pass-77' },
      headers: { cookie },
    });
    expect(wrongCurrent.status).toBe(400);
    const ok = await h.request('/api/auth/change-password', {
      body: { currentPassword: PASSWORD, newPassword: 'brand-new-pass-77' },
      headers: { cookie },
    });
    expect(ok.status).toBe(200);
    expect((await signIn(h, 'brand-new-pass-77')).status).toBe(200);
  });
});

describe('API認可', () => {
  test('セッションなし・不正なCookieは401', async () => {
    const h = createHarness();
    expect((await h.request('/v1/me')).status).toBe(401);
    expect(
      (await h.request('/v1/me', { headers: { cookie: 'better-auth.session_token=forged.value' } })).status,
    ).toBe(401);
  });

  test('クライアントが送るユーザーIDは無視され、セッションのユーザーが使われる', async () => {
    const h = createHarness();
    await registerVerified(h);
    const cookie = (await signIn(h)).headers.get('set-cookie')!.split(';')[0]!;
    const userId = (h.sqlite.query('SELECT id FROM user').get() as { id: string }).id;
    const res = await h.request('/v1/me?userId=someone-else', {
      headers: { cookie, 'x-user-id': 'someone-else' },
    });
    expect(((await res.json()) as { id: string }).id).toBe(userId);
  });

  test('別アカウントのセッションで他人として振る舞えない', async () => {
    const h = createHarness();
    await registerVerified(h);
    await signUp(h, 'other@example.com', 'secure-pass-2026');
    await h.request(`/api/auth/verify-email?token=${new URL(h.lastLink()).searchParams.get('token')}`);
    const cookieB = (
      await h.request('/api/auth/sign-in/email', {
        body: { email: 'other@example.com', password: 'secure-pass-2026' },
      })
    ).headers
      .get('set-cookie')!
      .split(';')[0]!;
    const idB = (
      h.sqlite.query("SELECT id FROM user WHERE email = 'other@example.com'").get() as { id: string }
    ).id;
    const me = (await (await h.request('/v1/me', { headers: { cookie: cookieB } })).json()) as { id: string };
    expect(me.id).toBe(idB);
  });
});
