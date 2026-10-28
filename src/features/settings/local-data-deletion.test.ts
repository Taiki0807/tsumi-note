import { deleteLocalData, describeLocalDeletion, type LocalDeletionDeps } from './local-data-deletion';

function deps(over: Partial<LocalDeletionDeps> = {}) {
  const calls: string[] = [];
  const d: LocalDeletionDeps = {
    accountId: null,
    wipeNow: jest.fn(async () => void calls.push('wipe')),
    arm: jest.fn(() => void calls.push('arm')),
    disarm: jest.fn(() => void calls.push('disarm')),
    signOut: jest.fn(async () => {
      calls.push('signOut');
      return { ok: true };
    }),
    ...over,
  };
  return { d, calls };
}

describe('deleteLocalData', () => {
  it('ゲスト: その場で削除し、ログアウト・合図はしない', async () => {
    const { d, calls } = deps();
    expect(await deleteLocalData(d)).toEqual({ ok: true, deferred: false });
    expect(calls).toEqual(['wipe']);
  });

  it('ゲスト: 失敗したら成功と表示しない', async () => {
    const { d } = deps({ wipeNow: () => Promise.reject(new Error('io')) });
    expect((await deleteLocalData(d)).ok).toBe(false);
  });

  it('ログイン中: 合図→ログアウトの順で、削除自体はログアウト後に委ねる(その場では消さない)', async () => {
    const { d, calls } = deps({ accountId: 'userA' });
    expect(await deleteLocalData(d)).toEqual({ ok: true, deferred: true });
    expect(calls).toEqual(['arm', 'signOut']);
    expect(d.wipeNow).not.toHaveBeenCalled();
  });

  it('ログイン中: ログアウトに失敗したら合図を取り消し、失敗を返す', async () => {
    const { d, calls } = deps({ accountId: 'userA', signOut: async () => ({ ok: false }) });
    expect((await deleteLocalData(d)).ok).toBe(false);
    expect(calls).toEqual(['arm', 'disarm']);
  });

  it('ログイン中: ログアウトが例外でも合図を取り消す', async () => {
    const { d, calls } = deps({ accountId: 'userA', signOut: () => Promise.reject(new Error('x')) });
    expect((await deleteLocalData(d)).ok).toBe(false);
    expect(calls).toEqual(['arm', 'disarm']);
  });
});

describe('describeLocalDeletion', () => {
  it('ゲスト: 対象にすべてのアカウントの端末内データを含むこと、クラウドは消えないことを示す', () => {
    const text = describeLocalDeletion({ signedIn: false, pending: 0 }).paragraphs.join('');
    expect(text).toContain('元に戻せません');
    expect(text).toContain('すべてのアカウントの端末内データ');
    expect(text).toContain('クラウドやほかの端末のデータは削除されません');
    expect(text).toContain('失われます');
  });

  it('ログイン中: クラウド・他端末に影響しないことと再ログインでの再取得を明示する', () => {
    const text = describeLocalDeletion({ signedIn: true, pending: 0 }).paragraphs.join('');
    expect(text).toContain('クラウドに保存されたデータと、ほかの端末のデータは削除されません');
    expect(text).toContain('再ログインすると、クラウドのデータがこの端末に再び読み込まれます');
    expect(text).toContain('アカウントを削除');
    expect(text).not.toContain('件あります');
  });

  it('未送信の変更があれば件数を警告する', () => {
    expect(describeLocalDeletion({ signedIn: true, pending: 3 }).paragraphs.join('')).toContain('3件');
  });
});
