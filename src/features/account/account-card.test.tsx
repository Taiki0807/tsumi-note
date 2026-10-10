import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AccountCardView, type AccountSync } from './account-card';

// reanimated / router を使う実UI部品は、ネイティブ無しの jest では読み込めないため単純な代替に置き換える
jest.mock('@/components/form-ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text, View } = require('react-native');
  return {
    Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View>{children}</View> : null,
  };
});
jest.mock('@/features/auth/auth-ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, TextInput } = require('react-native');
  return {
    Notice: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    PasswordInput: ({ label, ...rest }: { label: string }) => (
      <TextInput accessibilityLabel={label} {...rest} />
    ),
  };
});

const sync = (over: Partial<AccountSync> = {}): AccountSync => ({
  status: 'idle',
  lastSyncedAt: new Date(2026, 9, 10, 9, 5).getTime(),
  pending: 0,
  conflicts: 0,
  syncNow: jest.fn(),
  ...over,
});

const ok = async () => ({ ok: true as const, data: null });

async function renderCard(over: Partial<React.ComponentProps<typeof AccountCardView>> = {}) {
  const props = {
    email: 'a@example.com',
    providers: ['credential'] as string[] | null,
    sync: sync(),
    onLogout: jest.fn(ok),
    onDelete: jest.fn(ok),
    onRetryInfo: jest.fn(),
    ...over,
  };
  const view = await render(<AccountCardView {...props} />);
  return { props, unmount: view.unmount };
}

const press = (text: string | RegExp) => fireEvent.press(screen.getByText(text));
const pressLast = (text: string) => fireEvent.press(screen.getAllByText(text).at(-1)!);

describe('AccountCardView', () => {
  it('メールアドレス・ログイン方法・同期状態・最終同期日時を表示する', async () => {
    await renderCard({ providers: ['credential', 'google'] });
    expect(screen.getByText('a@example.com')).toBeTruthy();
    expect(screen.getByText(/ログイン方法: メールアドレス、Google/)).toBeTruthy();
    expect(screen.getByText('同期済み')).toBeTruthy();
    expect(screen.getByText(/最終同期: 10\/10 09:05/)).toBeTruthy();
  });

  it.each([
    ['syncing', 0, '同期中'],
    ['offline', 2, 'オフライン'],
    ['error', 1, '同期エラー'],
    ['update-required', 0, 'アプリの更新が必要'],
    ['idle', 3, '未同期あり'],
  ] as const)('状態 %s → %s', async (status, pending, label) => {
    await renderCard({ sync: sync({ status, pending }) });
    expect(screen.getByText(label)).toBeTruthy();
    // 同期できていない間も、データが端末に保存されていることを伝える
    if (status !== 'idle') expect(screen.getByText(/端末に保存/)).toBeTruthy();
  });

  it('手動同期は既存の同期処理を呼ぶ', async () => {
    const { props } = await renderCard();
    await press('今すぐ同期');
    expect(props.sync.syncNow).toHaveBeenCalledTimes(1);
  });

  it.each(['syncing', 'update-required'] as const)('状態 %s では手動同期を再実行しない', async (status) => {
    const s = sync({ status });
    await renderCard({ sync: s });
    await press(status === 'syncing' ? '同期中…' : '今すぐ同期');
    expect(s.syncNow).not.toHaveBeenCalled();
  });

  it('ログアウトは確認が出て、未同期の変更があれば警告し、データは削除されないと説明する', async () => {
    const { props } = await renderCard({ sync: sync({ pending: 4 }) });
    await press('ログアウト');
    expect(screen.getByText('ログアウトしますか？')).toBeTruthy();
    expect(screen.getByText(/同期されていない変更が4件/)).toBeTruthy();
    expect(screen.getAllByText(/削除されません/).length).toBeGreaterThan(0);
    expect(props.onLogout).not.toHaveBeenCalled();
    await pressLast('ログアウト');
    await waitFor(() => expect(props.onLogout).toHaveBeenCalledTimes(1));
  });

  it('削除: 対象と取り消せないことを説明し、キャンセルでは何も実行しない', async () => {
    const { props } = await renderCard();
    await press('アカウントを削除');
    expect(screen.getByText(/元に戻すことはできません/)).toBeTruthy();
    expect(screen.getByText(/クラウド上のノート画像/)).toBeTruthy();
    await pressLast('キャンセル');
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('アカウントを削除しますか？')).toBeNull();
  });

  it('削除: パスワード入力前は実行できず、入力後に送る', async () => {
    const { props } = await renderCard();
    await press('アカウントを削除');
    await press('削除する');
    expect(props.onDelete).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('現在のパスワード'), 'my-password-1');
    await press('削除する');
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith('my-password-1'));
  });

  it('削除: 通信失敗ではエラーを表示し、成功とは表示せず、再試行できる', async () => {
    const onDelete = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        kind: 'network',
        message: '通信できませんでした。端末のデータは削除されていません。',
      })
      .mockResolvedValueOnce({ ok: true, data: null });
    await renderCard({ onDelete });
    await press('アカウントを削除');
    await fireEvent.changeText(screen.getByLabelText('現在のパスワード'), 'my-password-1');
    await press('削除する');
    expect(await screen.findByText(/端末のデータは削除されていません/)).toBeTruthy();
    expect(screen.queryByText(/削除しました|削除が完了/)).toBeNull();
    await press('削除する');
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
  });

  it('削除: 二重タップしても1回だけ実行される', async () => {
    let release!: () => void;
    const onDelete = jest.fn(
      () => new Promise<{ ok: true; data: null }>((r) => (release = () => r({ ok: true, data: null }))),
    );
    await renderCard({ onDelete });
    await press('アカウントを削除');
    await fireEvent.changeText(screen.getByLabelText('現在のパスワード'), 'my-password-1');
    await press('削除する');
    await press('削除中…');
    expect(onDelete).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('ソーシャルのみのアカウントはパスワードを求めない', async () => {
    const { props } = await renderCard({ providers: ['apple'] });
    await press('アカウントを削除');
    expect(screen.queryByLabelText('現在のパスワード')).toBeNull();
    await press('削除する');
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith(undefined));
  });

  it('ログイン方法を取得できなくても削除でき、入力したパスワードはそのまま送る(判断はサーバー)', async () => {
    const { props } = await renderCard({ providers: null });
    await press('アカウントを削除');
    expect(screen.getByText(/ログイン方法を確認できていません/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('現在のパスワード'), 'my-password-1');
    await press('削除する');
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith('my-password-1'));
    await press('ログイン方法を再取得');
    expect(props.onRetryInfo).toHaveBeenCalled();
  });

  it('削除が途中で止まっているアカウントでは再試行でき、完了するまで成功と表示しない', async () => {
    const onDelete = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, kind: 'incomplete', message: '削除を完了できませんでした。' })
      .mockResolvedValueOnce({ ok: true, data: null });
    await renderCard({ providers: null, deletionPending: true, onDelete });
    expect(screen.getByText(/削除が完了していません。削除を再試行してください/)).toBeTruthy();
    await press('アカウント削除を再試行');
    expect(screen.getByText(/前回のアカウント削除が完了していません/)).toBeTruthy();
    await press('削除を再試行');
    expect(await screen.findByText('削除を完了できませんでした。')).toBeTruthy();
    expect(screen.queryByText(/削除しました/)).toBeNull();
    await press('削除を再試行');
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
  });
});
