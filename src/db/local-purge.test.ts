import { runPendingPurge, requestLocalPurge, type PurgeStorage } from './local-purge';
import { databaseNameForOwner, GUEST_DATABASE_NAME, imageDirectoryForOwner } from './ownership';

function setup(initial: string | null = null) {
  let value = initial;
  const storage: PurgeStorage = {
    get: () => value,
    set: (id) => (value = id),
    clear: () => (value = null),
  };
  const deleted: string[] = [];
  const deps = {
    storage,
    deleteDatabase: jest.fn(async (n: string) => void deleted.push(n)),
    deleteImageDirectory: jest.fn((n: string) => void deleted.push(n)),
  };
  return { storage, deps, deleted, value: () => value };
}

describe('ログアウトと再ログイン', () => {
  it('ログアウトでは何も予約・削除されず、再ログインで同じアカウントDB・画像を使う', async () => {
    const s = setup();
    // ログアウト = 所有者がゲストに戻るだけ。削除予約は作られず、実行しても何も削除しない
    expect(await runPendingPurge(s.deps, GUEST_DATABASE_NAME)).toBe(false);
    expect(s.deleted).toEqual([]);
    expect(databaseNameForOwner('userA')).toBe(databaseNameForOwner('userA'));
    expect(imageDirectoryForOwner('userA')).toBe(imageDirectoryForOwner('userA'));
    expect(databaseNameForOwner('userA')).not.toBe(databaseNameForOwner('userB'));
    expect(imageDirectoryForOwner('userA')).not.toBe(imageDirectoryForOwner('userB'));
  });
});

describe('アカウント削除後の端末データ削除', () => {
  it('予約が無ければ何も削除しない', async () => {
    const s = setup();
    expect(await runPendingPurge(s.deps, GUEST_DATABASE_NAME)).toBe(false);
    expect(s.deleted).toEqual([]);
  });

  it('ゲストに切り替わった後、そのアカウントのDBと画像だけを削除して予約を消す', async () => {
    const s = setup();
    requestLocalPurge(s.storage, 'userA');
    expect(await runPendingPurge(s.deps, GUEST_DATABASE_NAME)).toBe(true);
    expect(s.deleted).toEqual([databaseNameForOwner('userA'), imageDirectoryForOwner('userA')]);
    expect(s.deleted).not.toContain(GUEST_DATABASE_NAME);
    expect(s.deleted).not.toContain(databaseNameForOwner('userB'));
    expect(s.value()).toBeNull();
  });

  it('使用中のDBは削除しない(予約は残る)', async () => {
    const s = setup();
    requestLocalPurge(s.storage, 'userA');
    expect(await runPendingPurge(s.deps, databaseNameForOwner('userA'))).toBe(false);
    expect(s.deleted).toEqual([]);
    expect(s.value()).toBe('userA');
  });

  it('削除に失敗したら予約を残し、次回に再試行できる', async () => {
    const s = setup();
    requestLocalPurge(s.storage, 'userA');
    s.deps.deleteDatabase.mockRejectedValueOnce(new Error('busy'));
    expect(await runPendingPurge(s.deps, GUEST_DATABASE_NAME)).toBe(false);
    expect(s.value()).toBe('userA');
    expect(await runPendingPurge(s.deps, GUEST_DATABASE_NAME)).toBe(true);
    expect(s.value()).toBeNull();
  });

  it('不正なIDは予約せず、保存されていても削除せず破棄する', async () => {
    const s = setup();
    requestLocalPurge(s.storage, '../etc');
    expect(s.value()).toBeNull();
    const t = setup('../x');
    expect(await runPendingPurge(t.deps, GUEST_DATABASE_NAME)).toBe(false);
    expect(t.deleted).toEqual([]);
    expect(t.value()).toBeNull();
  });
});
