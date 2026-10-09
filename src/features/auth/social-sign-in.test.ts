import { googleRedirectUri } from './social-sign-in';

describe('googleRedirectUri', () => {
  it('iOSクライアントIDから逆順ドメインのリダイレクトURIを作る', () => {
    expect(googleRedirectUri('1234-abc.apps.googleusercontent.com')).toBe(
      'com.googleusercontent.apps.1234-abc:/oauthredirect',
    );
  });
  it('形式の違うIDは拒否する(推測で組み立てない)', () => {
    expect(googleRedirectUri('1234-abc')).toBeNull();
    expect(googleRedirectUri('.apps.googleusercontent.com')).toBeNull();
    expect(googleRedirectUri('')).toBeNull();
  });
});
