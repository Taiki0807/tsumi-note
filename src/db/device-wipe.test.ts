import {
  accountDatabaseNames,
  accountImageDirectories,
  armDeviceWipe,
  consumeDeviceWipe,
  disarmDeviceWipe,
  publishWipeResult,
  setWipeNotice,
  takeWipeNotice,
  wipeDevice,
  type DeviceWipeDeps,
} from './device-wipe';
import { databaseNameForOwner, GUEST_DATABASE_NAME, GUEST_IMAGE_DIRECTORY, imageDirectoryForOwner } from './ownership';

function setup(over: Partial<DeviceWipeDeps> = {}) {
  const log: string[] = [];
  const a = databaseNameForOwner('userA');
  const b = databaseNameForOwner('userB');
  const deps: DeviceWipeDeps = {
    wipeGuestRows: jest.fn(() => void log.push('guest-rows')),
    deleteGuestImages: jest.fn(() => void log.push('guest-images')),
    cancelScheduledNotifications: jest.fn(async () => void log.push('notifications')),
    listDatabaseFiles: () => [GUEST_DATABASE_NAME, `${GUEST_DATABASE_NAME}-wal`, a, `${a}-wal`, `${a}-shm`, b, 'other.db'],
    listDocumentEntries: () => [GUEST_IMAGE_DIRECTORY, imageDirectoryForOwner('userA'), imageDirectoryForOwner('userB'), 'SQLite', 'x'],
    deleteDatabase: jest.fn(async (n: string) => void log.push(`db:${n}`)),
    deleteImageDirectory: jest.fn((n: string) => void log.push(`dir:${n}`)),
    ...over,
  };
  return { deps, log, a, b };
}

describe('wipeDevice', () => {
  it('ゲストの行・画像・通知と、すべてのアカウントのDB・画像だけを削除する(ゲストDBファイルや無関係なファイルは残す)', async () => {
    const { deps, log, a, b } = setup();
    await wipeDevice(deps);
    expect(log).toEqual([
      'guest-rows',
      'guest-images',
      'notifications',
      `db:${a}`,
      `db:${b}`,
      `dir:${imageDirectoryForOwner('userA')}`,
      `dir:${imageDirectoryForOwner('userB')}`,
    ]);
    expect(deps.deleteDatabase).not.toHaveBeenCalledWith(GUEST_DATABASE_NAME);
    expect(deps.deleteImageDirectory).not.toHaveBeenCalledWith(GUEST_IMAGE_DIRECTORY);
  });

  it('ゲスト行の削除に失敗したら、アカウントのファイルには触れず例外を投げる', async () => {
    const { deps } = setup({
      wipeGuestRows: () => {
        throw new Error('locked');
      },
    });
    await expect(wipeDevice(deps)).rejects.toThrow('locked');
    expect(deps.deleteDatabase).not.toHaveBeenCalled();
    expect(deps.deleteImageDirectory).not.toHaveBeenCalled();
  });

  it('アカウントDBの削除に失敗したら例外を投げる(成功扱いにしない)', async () => {
    const { deps } = setup({ deleteDatabase: () => Promise.reject(new Error('io')) });
    await expect(wipeDevice(deps)).rejects.toThrow('io');
  });
});

describe('ファイル名の判定', () => {
  it('アカウント別DBは -wal/-shm を除いて重複なく、それ以外は対象にしない', () => {
    const a = databaseNameForOwner('userA');
    expect(accountDatabaseNames([a, `${a}-wal`, `${a}-shm`, GUEST_DATABASE_NAME, 'tsumi-note-acct-zz.db', 'evil.db'])).toEqual([a]);
  });

  it('アカウント別の画像ディレクトリだけを選ぶ', () => {
    expect(accountImageDirectories([GUEST_IMAGE_DIRECTORY, imageDirectoryForOwner('userA'), 'note-images-acct-', 'Documents'])).toEqual([
      imageDirectoryForOwner('userA'),
    ]);
  });
});

describe('削除の合図(メモリのみ・1回限り)', () => {
  afterEach(disarmDeviceWipe);

  it('合図が無ければ実行しない(過去の予約が後日のログアウトで実行されない)', () => {
    expect(consumeDeviceWipe()).toBe(false);
  });

  it('合図は1回だけ有効', () => {
    armDeviceWipe(1000);
    expect(consumeDeviceWipe(2000)).toBe(true);
    expect(consumeDeviceWipe(2000)).toBe(false);
  });

  it('期限(60秒)を過ぎた合図は無効で、消費される', () => {
    armDeviceWipe(1000);
    expect(consumeDeviceWipe(1000 + 60_001)).toBe(false);
    expect(consumeDeviceWipe(1000 + 1)).toBe(false);
  });

  it('取り消した合図は実行されない', () => {
    armDeviceWipe();
    disarmDeviceWipe();
    expect(consumeDeviceWipe()).toBe(false);
  });
});

describe('結果の通知', () => {
  it('1回だけ受け取れる', () => {
    setWipeNotice({ tone: 'success', message: 'ok' });
    expect(takeWipeNotice()).toEqual({ tone: 'success', message: 'ok' });
    expect(takeWipeNotice()).toBeNull();
  });
});

describe('publishWipeResult(reload による再マウントを越える通知)', () => {
  afterEach(() => void takeWipeNotice());

  it('reload の時点で通知は保存済みで、再マウント後に1回だけ受け取れる(重複しない)', () => {
    let atReload: ReturnType<typeof takeWipeNotice> = null;
    // 再マウント = reload 内で新しい画面が初期化時に takeWipeNotice する
    publishWipeResult({ tone: 'success', message: 'ok' }, () => {
      atReload = takeWipeNotice();
    });
    expect(atReload).toEqual({ tone: 'success', message: 'ok' });
    expect(takeWipeNotice()).toBeNull();
  });

  it('失敗の結果は error として渡り、成功通知は残らない', () => {
    publishWipeResult({ tone: 'error', message: 'ng' }, () => undefined);
    expect(takeWipeNotice()).toEqual({ tone: 'error', message: 'ng' });
    expect(takeWipeNotice()).toBeNull();
  });

  it('保存していなければ(アプリ再起動後など)何も出ない', () => {
    expect(takeWipeNotice()).toBeNull();
  });
});
