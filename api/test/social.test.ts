import { describe, expect, test } from 'bun:test';
import { createHarness } from './harness';

describe('ソーシャルログイン(ネイティブIDトークン方式のみ)', () => {
  test('idToken なしの /sign-in/social(ブラウザ経由のリダイレクト方式)は拒否する', async () => {
    const h = createHarness();
    const res = await h.request('/api/auth/sign-in/social', {
      body: { provider: 'google', callbackURL: 'tsumi-note://verified' },
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  test('リダイレクト方式のコールバック・アカウント連携エンドポイントは存在しない扱い', async () => {
    const h = createHarness();
    for (const path of ['/api/auth/callback/google', '/api/auth/callback/apple', '/api/auth/link-social']) {
      const res = await h.request(path, { body: {} });
      expect(res.status).toBe(404);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  test('不正なIDトークンではセッションを発行しない', async () => {
    const h = createHarness();
    const res = await h.request('/api/auth/sign-in/social', {
      body: { provider: 'google', idToken: { token: 'not-a-jwt' } },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
