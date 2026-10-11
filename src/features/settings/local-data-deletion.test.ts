import { deleteLocalData, describeLocalDeletion, type LocalDeletionDeps } from './local-data-deletion';

function deps(over: Partial<LocalDeletionDeps> = {}) {
  const calls: string[] = [];
  const d: LocalDeletionDeps = {
    accountId: null,
    wipeGuest: jest.fn(async () => void calls.push('wipe')),
    requestAccountPurge: jest.fn((id: string) => void calls.push(`purge:${id}`)),
    cancelAccountPurge: jest.fn(() => void calls.push('cancel')),
    signOut: jest.fn(async () => {
      calls.push('signOut');
      return { ok: true };
    }),
    ...over,
  };
  return { d, calls };
}

describe('deleteLocalData', () => {
  it('ゲスト: ゲストのデータだけを消し、ログアウト・予約はしない', async () => {
    const { d, calls } = deps();
    expect(await deleteLocalData(d)).toEqual({ ok: true });
    expect(calls).toEqual(['wipe']);
  });

  it('ゲスト: 失敗したら成功と表示しない', async () => {
    const { d } = deps({ wipeGuest: () => Promise.reject(new Error('io')) });
    expect((await deleteLocalData(d)).ok).toBe(false);
  });

  it('ログイン中: そのアカウントの削除を予約してからログアウトする。ゲストは消さない', async () => {
    const { d, calls } = deps({ accountId: 'userA' });
    expect(await deleteLocalData(d)).toEqual({ ok: true });
    expect(calls).toEqual(['purge:userA', 'signOut']);
    expect(d.wipeGuest).not.toHaveBeenCalled();
  });

  it('ログイン中: ログアウトに失敗したら予約を取り消し、失敗を返す', async () => {
    const { d, calls } = deps({ accountId: 'userA', signOut: async () => ({ ok: false }) });
    expect((await deleteLocalData(d)).ok).toBe(false);
    expect(calls).toEqual(['purge:userA', 'cancel']);
  });

  it('ログイン中: ログアウトが例外でも予約を取り消す', async () => {
    const { d, calls } = deps({ accountId: 'userA', signOut: () => Promise.reject(new Error('x')) });
    expect((await deleteLocalData(d)).ok).toBe(false);
    expect(calls).toEqual(['purge:userA', 'cancel']);
  });
});

describe('describeLocalDeletion', () => {
  it('ゲストにはクラウドの説明を出さず、元に戻せないことを示す', () => {
    const text = describeLocalDeletion({ signedIn: false, pending: 0 }).paragraphs.join('');
    expect(text).toContain('元に戻せません');
    expect(text).not.toContain('クラウド');
  });

  it('ログイン中はクラウド・他端末に影響しないことと再ログインでの再取得を明示する', () => {
    const text = describeLocalDeletion({ signedIn: true, pending: 0 }).paragraphs.join('');
    expect(text).toContain('クラウドに保存されたデータと、ほかの端末のデータは削除されません');
    expect(text).toContain('再ログインすると、クラウドのデータがこの端末に再び読み込まれます');
    expect(text).toContain('アカウントを削除');
    expect(text).not.toContain('同期されていない');
  });

  it('未送信の変更があれば件数を警告する', () => {
    expect(describeLocalDeletion({ signedIn: true, pending: 3 }).paragraphs.join('')).toContain('3件');
  });
});
