import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AccountSummary } from './account-summary';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const base = { status: 'idle' as const, lastSyncedAt: null, pending: 0, conflicts: 0 };

describe('AccountSummary(マイページのアカウント行)', () => {
  it('メールアドレスと同期状態を表示し、タップでアカウント画面へ遷移する', async () => {
    await render(<AccountSummary email="a@example.com" sync={base} />);
    expect(screen.getByText('a@example.com')).toBeTruthy();
    expect(screen.getByText('同期済み')).toBeTruthy();
    // 削除・ログアウトはマイページに直接置かない
    expect(screen.queryByText('アカウントを削除')).toBeNull();
    fireEvent.press(screen.getByRole('button'));
    expect(router.push).toHaveBeenCalledWith('/account');
  });

  it('同期済みなら最終同期日時を表示し、同期成功後の更新にも追従する', async () => {
    const t1 = new Date(2026, 9, 10, 9, 5).getTime();
    const t2 = new Date(2026, 9, 11, 21, 30).getTime();
    const view = await render(<AccountSummary email="a@example.com" sync={{ ...base, lastSyncedAt: t1 }} />);
    expect(screen.getByText('最終同期: 10/10 09:05')).toBeTruthy();
    await view.rerender(<AccountSummary email="a@example.com" sync={{ ...base, lastSyncedAt: t2 }} />);
    expect(screen.getByText('最終同期: 10/11 21:30')).toBeTruthy();
    expect(screen.queryByText('最終同期: 10/10 09:05')).toBeNull();
  });

  it('未同期や不正な値では日時を作らず「まだありません」を表示する(他アカウントの値も残らない)', async () => {
    const view = await render(<AccountSummary email="a@example.com" sync={{ ...base, lastSyncedAt: null }} />);
    expect(screen.getByText('最終同期: まだありません')).toBeTruthy();
    await view.rerender(<AccountSummary email="a@example.com" sync={{ ...base, lastSyncedAt: Number.NaN }} />);
    expect(screen.getByText('最終同期: まだありません')).toBeTruthy();
    expect(screen.queryByText(/NaN|Invalid/)).toBeNull();
  });
});
