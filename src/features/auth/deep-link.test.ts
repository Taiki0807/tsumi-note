import { hasCredentialParams, parseResetLink, parseVerifiedLink } from './deep-link';

describe('parseVerifiedLink', () => {
  it('パラメータなしは確認成功', () => {
    expect(parseVerifiedLink({})).toEqual({ kind: 'verified', error: null });
  });
  it('error クエリは失敗として扱う', () => {
    expect(parseVerifiedLink({ error: 'invalid_token' }).error).toBe('invalid_token');
    expect(parseVerifiedLink({ error: 'token_expired' }).error).toBe('token_expired');
  });
  it('不正な error 値・配列は invalid_link にする', () => {
    expect(parseVerifiedLink({ error: '<script>' }).error).toBe('invalid_link');
    expect(parseVerifiedLink({ error: ['a', 'b'] }).error).toBe('invalid_link');
  });
  it('認証情報らしきクエリが付いたリンクは信用しない', () => {
    for (const key of ['cookie', 'session_token', 'bearer', 'access_token']) {
      expect(parseVerifiedLink({ [key]: 'x' }).error).toBe('invalid_link');
    }
  });
});

describe('parseResetLink', () => {
  it('形式を満たすトークンを受け付ける', () => {
    expect(parseResetLink({ token: 'AbCdEf0123456789-_' }).token).toBe('AbCdEf0123456789-_');
  });
  it('トークンなし・短すぎ・不正文字・長すぎ・配列を拒否する', () => {
    expect(parseResetLink({}).token).toBeNull();
    expect(parseResetLink({ token: 'short' }).token).toBeNull();
    expect(parseResetLink({ token: 'abcdefgh/../etc' }).token).toBeNull();
    expect(parseResetLink({ token: 'a'.repeat(513) }).token).toBeNull();
    expect(parseResetLink({ token: ['abcdefgh12', 'abcdefgh34'] }).token).toBeNull();
  });
  it('認証情報らしきクエリが付いたリンクはトークンがあっても拒否する', () => {
    expect(parseResetLink({ token: 'AbCdEf0123456789', cookie: 'x' }).token).toBeNull();
    expect(hasCredentialParams({ session_token: 'x' })).toBe(true);
    expect(hasCredentialParams({ token: 'x' })).toBe(false);
  });
});
