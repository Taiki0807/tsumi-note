import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AccountSummary } from './account-summary';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('AccountSummary(マイページのアカウント行)', () => {
  it('メールアドレスと同期状態を表示し、タップでアカウント画面へ遷移する', async () => {
    await render(
      <AccountSummary email="a@example.com" sync={{ status: 'idle', pending: 0, conflicts: 0 }} />,
    );
    expect(screen.getByText('a@example.com')).toBeTruthy();
    expect(screen.getByText('同期済み')).toBeTruthy();
    // 削除・ログアウトはマイページに直接置かない
    expect(screen.queryByText('アカウントを削除')).toBeNull();
    fireEvent.press(screen.getByRole('button'));
    expect(router.push).toHaveBeenCalledWith('/account');
  });
});
