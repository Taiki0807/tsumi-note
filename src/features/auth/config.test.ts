import { normalizeApiUrl, readAuthConfig } from './config';

describe('normalizeApiUrl', () => {
  it('未設定は null(認証機能なし)', () => {
    expect(normalizeApiUrl(undefined, true)).toBeNull();
    expect(normalizeApiUrl('', false)).toBeNull();
  });
  it('https は環境を問わず許可し、末尾スラッシュを除く', () => {
    expect(normalizeApiUrl('https://api.example.com/', false)).toBe('https://api.example.com');
  });
  it('本番では http を許可しない', () => {
    expect(normalizeApiUrl('http://localhost:8787', false)).toBeNull();
    expect(normalizeApiUrl('http://192.168.0.5:8787', false)).toBeNull();
  });
  it('開発ではローカル/プライベートの http のみ許可する', () => {
    expect(normalizeApiUrl('http://localhost:8787', true)).toBe('http://localhost:8787');
    expect(normalizeApiUrl('http://192.168.0.5:8787', true)).toBe('http://192.168.0.5:8787');
    expect(normalizeApiUrl('http://evil.example.com', true)).toBeNull();
  });
  it('認証情報・query・不正な値を拒否する', () => {
    expect(normalizeApiUrl('https://user:pw@api.example.com', false)).toBeNull();
    expect(normalizeApiUrl('https://api.example.com?x=1', false)).toBeNull();
    expect(normalizeApiUrl('not a url', true)).toBeNull();
  });
});

describe('readAuthConfig', () => {
  it('環境変数から環境別に値を読む', () => {
    const config = readAuthConfig(
      {
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: ' id.apps.googleusercontent.com ',
      },
      false,
    );
    expect(config).toEqual({
      apiUrl: 'https://api.example.com',
      googleIosClientId: 'id.apps.googleusercontent.com',
      scheme: 'tsumi-note',
    });
  });
  it('未設定なら無効', () => {
    expect(readAuthConfig({}, false)).toEqual({
      apiUrl: null,
      googleIosClientId: null,
      scheme: 'tsumi-note',
    });
  });
});
