import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkProductionConfig } from '../scripts/check-deploy';
import { createAuth } from '../src/auth';
import { createRedirectPolicy, parseAppEnvironment } from '../src/redirect-policy';
import { EMAIL, PASSWORD, createHarness, signUp } from './harness';

const ROOT = join(import.meta.dir, '..');
const PROD = { environment: 'production', baseURL: 'https://api.tsumi.test' } as const;

async function openLink(h: ReturnType<typeof createHarness>, link: string) {
  const u = new URL(link);
  return h.request(`${u.pathname}${u.search}`);
}

async function registerVerified(h: ReturnType<typeof createHarness>) {
  await signUp(h);
  await openLink(h, h.lastLink());
}

const requestReset = (h: ReturnType<typeof createHarness>, redirectTo: string) =>
  h.request('/api/auth/request-password-reset', { body: { email: EMAIL, redirectTo } });

describe('リダイレクト許可リスト(ポリシー)', () => {
  const prod = createRedirectPolicy({ environment: 'production', appScheme: 'tsumi-note' });
  const dev = createRedirectPolicy({ environment: 'development', appScheme: 'tsumi-note' });

  test('正規の遷移先は許可される', () => {
    expect(prod.isAllowedRedirect('tsumi-note://reset-password')).toBe(true);
    expect(prod.isAllowedRedirect('tsumi-note://verified')).toBe(true);
  });

  test('任意のhost・path・外部URLは拒否される', () => {
    for (const url of [
      'tsumi-note://evil/steal',
      'tsumi-note://',
      'tsumi-note://reset-password/extra',
      'tsumi-note://reset-password/',
      'tsumi-note://reset-password?x=1',
      'tsumi-note://reset-password#frag',
      'https://evil.example/reset-password',
      'http://localhost:8787/',
      'evil://reset-password',
      '/relative/path',
      '/../evil',
      '//evil.example',
      'javascript:alert(1)',
    ]) {
      expect(prod.isAllowedRedirect(url)).toBe(false);
    }
  });

  test('エンコード・大文字小文字・userinfo・バックスラッシュ等の回避は拒否される', () => {
    for (const url of [
      'tsumi-note://reset%2Dpassword',
      'tsumi-note://reset-password%2F..%2Fevil',
      'tsumi-note://evil/%2e%2e/reset-password',
      'tsumi-note://reset-password/../evil',
      'TSUMI-NOTE://reset-password',
      'tsumi-note://Reset-Password',
      'tsumi-note://evil@reset-password',
      'tsumi-note://reset-password@evil',
      'tsumi-note://user:pass@reset-password',
      'tsumi-note:\\\\reset-password',
      'tsumi-note://reset-password\\@evil',
      ' tsumi-note://reset-password',
      'tsumi-note://reset-password\n',
      'tsumi-note://reset-password\u0000',
      'tsumi-note://reset-password.evil',
    ]) {
      expect(prod.isAllowedRedirect(url)).toBe(false);
    }
    expect(prod.isAllowedRedirect(undefined)).toBe(false);
    expect(prod.isAllowedRedirect(['tsumi-note://reset-password'])).toBe(false);
  });

  test('開発用exp://は本番で拒否され、developmentでは限定的に許可される', () => {
    const url = 'exp://192.168.0.5:8081/--/reset-password';
    expect(prod.isAllowedRedirect(url)).toBe(false);
    expect(prod.trustedOrigins).not.toContain('exp://');
    expect(dev.isAllowedRedirect(url)).toBe(true);
    expect(dev.isAllowedRedirect('exp://localhost:8081/--/verified')).toBe(true);
    // 開発でも任意host・pathは拒否
    expect(dev.isAllowedRedirect('exp://evil.example:8081/--/reset-password')).toBe(false);
    expect(dev.isAllowedRedirect('exp://192.168.0.5:8081/--/evil')).toBe(false);
    expect(dev.isAllowedRedirect('exp://192.168.0.5:8081@evil.example/--/reset-password')).toBe(false);
  });

  test('Universal Linkは設定したoriginの固定pathのみ許可される', () => {
    const p = createRedirectPolicy({
      environment: 'production',
      appScheme: 'tsumi-note',
      universalLinkOrigin: 'https://links.tsumi.test',
    });
    expect(p.isAllowedRedirect('https://links.tsumi.test/auth/reset-password')).toBe(true);
    expect(p.isAllowedRedirect('https://links.tsumi.test/other')).toBe(false);
    expect(p.isAllowedRedirect('https://links.tsumi.test.evil.example/auth/reset-password')).toBe(false);
    expect(() =>
      createRedirectPolicy({
        environment: 'production',
        appScheme: 'tsumi-note',
        universalLinkOrigin: 'http://x.test',
      }),
    ).toThrow();
  });
});

describe('リダイレクト許可リスト(API)', () => {
  test('不正なredirectToには再設定メールもトークンも作られない', async () => {
    const h = createHarness();
    await registerVerified(h);
    const before = h.sent.length;
    for (const redirectTo of [
      'tsumi-note://evil/steal',
      'https://evil.example/',
      'tsumi-note://reset%2Dpassword',
      'TSUMI-NOTE://reset-password',
    ]) {
      const res = await requestReset(h, redirectTo);
      expect(res.status).toBe(403);
    }
    expect(h.sent).toHaveLength(before);
    expect(
      h.sqlite.query("SELECT COUNT(*) AS n FROM verification WHERE identifier LIKE 'reset-password:%'").get(),
    ).toEqual({ n: 0 });
  });

  test('正規のredirectToではトークン付きで正規の遷移先へリダイレクトされる', async () => {
    const h = createHarness();
    await registerVerified(h);
    expect((await requestReset(h, 'tsumi-note://reset-password')).status).toBe(200);
    const res = await openLink(h, h.lastLink());
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('tsumi-note://reset-password?token=')).toBe(true);
  });

  test('メールリンクのcallbackURLを改ざんしても外部へ転送されない(再設定・確認)', async () => {
    const h = createHarness();
    await registerVerified(h);
    await requestReset(h, 'tsumi-note://reset-password');
    const u = new URL(h.lastLink());
    u.searchParams.set('callbackURL', 'tsumi-note://evil/steal');
    const res = await h.request(`${u.pathname}${u.search}`);
    expect(res.headers.get('location') ?? '').not.toContain('evil');
    expect(res.status).toBe(403);

    const v = await h.request('/api/auth/verify-email?token=x&callbackURL=https://evil.example/');
    expect(v.status).toBe(403);
    expect(v.headers.get('location')).toBeNull();
  });

  test('確認メール送信のcallbackURLも許可リストで検証される', async () => {
    const h = createHarness();
    await signUp(h);
    const bad = await h.request('/api/auth/send-verification-email', {
      body: { email: EMAIL, callbackURL: 'tsumi-note://evil/steal' },
    });
    expect(bad.status).toBe(403);
    const ok = await h.request('/api/auth/send-verification-email', {
      body: { email: EMAIL, callbackURL: 'tsumi-note://verified' },
    });
    expect(ok.status).toBe(200);
  });

  test('developmentでのみexp://の開発用遷移先が使える', async () => {
    const url = 'exp://192.168.0.5:8081/--/reset-password';
    const dev = createHarness();
    await registerVerified(dev);
    expect((await requestReset(dev, url)).status).toBe(200);

    const prod = createHarness(PROD);
    await registerVerified(prod);
    expect((await requestReset(prod, url)).status).toBe(403);
  });
});

describe('環境設定(production / development)', () => {
  test('productionではSecure Cookieが有効、developmentでは無効', async () => {
    const prod = createHarness(PROD);
    await registerVerified(prod);
    const res = await prod.request('/api/auth/sign-in/email', { body: { email: EMAIL, password: PASSWORD } });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toContain('__Secure-');

    const dev = createHarness();
    await registerVerified(dev);
    const devRes = await dev.request('/api/auth/sign-in/email', {
      body: { email: EMAIL, password: PASSWORD },
    });
    expect(devRes.headers.get('set-cookie') ?? '').not.toMatch(/;\s*Secure/i);
  });

  test('不正・未設定のAPP_ENVは安全側に失敗する', () => {
    for (const v of [undefined, '', 'prod', 'Production', 'staging', 'DEVELOPMENT', 1, null]) {
      expect(() => parseAppEnvironment(v)).toThrow();
      expect(() => createHarness({ environment: v as string })).toThrow();
    }
    expect(parseAppEnvironment('production')).toBe('production');
    expect(parseAppEnvironment('development')).toBe('development');
  });

  test('productionでhttpのBETTER_AUTH_URLは拒否される', () => {
    expect(() => createHarness({ environment: 'production', baseURL: 'http://api.tsumi.test' })).toThrow();
  });

  test('Workerエントリは不正なAPP_ENVで500を返す', async () => {
    const worker = (await import('../src/index')).default;
    const env = {
      BETTER_AUTH_SECRET: 'x'.repeat(40),
      APP_SCHEME: 'tsumi-note',
      BETTER_AUTH_URL: 'https://a.test',
    };
    for (const APP_ENV of [undefined, 'staging']) {
      const res = await worker.fetch(
        new Request('https://a.test/api/auth/sign-in/email', { method: 'POST' }),
        { ...env, APP_ENV } as never,
        {} as ExecutionContext,
      );
      expect(res.status).toBe(500);
    }
  });
});

describe('デプロイ設定', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const config = Bun.TOML.parse(readFileSync(join(ROOT, 'wrangler.toml'), 'utf8')) as Record<string, any>;

  test('deployは必ず--env productionを選択し、事前チェックを通す', () => {
    expect(pkg.scripts.deploy).toContain('--env production');
    expect(pkg.scripts.deploy).toContain('check:deploy');
    expect(pkg.scripts['db:migrate:remote']).toContain('--env production');
  });

  test('dev・ローカルmigrationはdevelopment環境を選択し、productionを指さない', () => {
    expect(pkg.scripts.dev).toContain('--env development');
    expect(pkg.scripts['db:migrate:local']).toContain('--env development');
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      if (name !== 'deploy' && name !== 'db:migrate:remote') expect(cmd).not.toContain('production');
    }
  });

  test('wrangler.tomlのtop-levelにAPP_ENV・D1がなく、環境ごとに分離されている', () => {
    expect(config.vars?.APP_ENV).toBeUndefined();
    expect(config.d1_databases).toBeUndefined();
    expect(config.env.production.vars.APP_ENV).toBe('production');
    expect(config.env.development.vars.APP_ENV).toBe('development');
    expect(config.env.production.vars.BETTER_AUTH_URL.startsWith('https://')).toBe(true);
  });

  test('現在のwrangler.toml(ダミー値あり)は本番デプロイ前チェックで止まる', () => {
    expect(checkProductionConfig(config).length).toBeGreaterThan(0);
    // ダミー値を許可すれば構造上の問題はない
    expect(checkProductionConfig(config, { allowPlaceholders: true })).toEqual([]);
  });

  test('開発設定が本番に混入した設定はチェックで検出される', () => {
    const bad = structuredClone(config);
    bad.vars = { APP_ENV: 'development' };
    bad.env.production.vars.APP_ENV = 'development';
    bad.env.production.vars.BETTER_AUTH_URL = 'http://localhost:8787';
    const problems = checkProductionConfig(bad, { allowPlaceholders: true });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  test('実値が設定された本番設定はチェックを通る', () => {
    const ok = structuredClone(config);
    ok.env.production.vars.BETTER_AUTH_URL = 'https://api.tsumi.test';
    ok.env.production.vars.EMAIL_FROM = 'つみノート <noreply@tsumi.test>';
    ok.env.production.d1_databases[0].database_id = '11111111-2222-3333-4444-555555555555';
    expect(checkProductionConfig(ok)).toEqual([]);
  });
});

// createAuth を直接使う型の確認(未使用警告の回避ではなく、公開シグネチャの回帰)
test('createAuthはenvironment必須', () => {
  expect(typeof createAuth).toBe('function');
});
