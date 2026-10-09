import { deriveAuthState } from './auth-state';

const session = { user: { id: 'u1', email: 'a@example.com', name: 'A' } };

describe('deriveAuthState', () => {
  it('認証機能が無効ならゲスト(signedOut)', () => {
    expect(deriveAuthState({ configured: false, isPending: false, session })).toEqual({
      status: 'signedOut',
      user: null,
    });
  });
  it('セッション読み込み中は loading', () => {
    expect(deriveAuthState({ configured: true, isPending: true, session: null }).status).toBe('loading');
  });
  it('保存済みセッションがあれば再取得中でも signedIn(セッション復元)', () => {
    const state = deriveAuthState({ configured: true, isPending: true, session });
    expect(state).toEqual({ status: 'signedIn', user: { id: 'u1', email: 'a@example.com', name: 'A' } });
  });
  it('ログアウト後・セッション失効後は signedOut', () => {
    expect(deriveAuthState({ configured: true, isPending: false, session: null }).status).toBe('signedOut');
  });
  it('ユーザー情報が不完全なセッションは信用しない', () => {
    expect(deriveAuthState({ configured: true, isPending: false, session: { user: { id: 1 } } }).status).toBe(
      'signedOut',
    );
  });
});
