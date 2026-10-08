import { act, renderHook } from '@testing-library/react-native';

import { failure, type AuthResult } from './auth-api';
import { useSubmit } from './use-submit';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useSubmit', () => {
  it('実行中の再実行は無視する(二重送信防止)', async () => {
    const d = deferred<AuthResult<null>>();
    const task = jest.fn(() => d.promise);
    const { result } = await renderHook(() => useSubmit());

    let first!: Promise<unknown>;
    let second: unknown;
    await act(async () => {
      first = result.current.run(task);
      second = await result.current.run(task); // 同一フレームの連打
    });
    expect(second).toBeNull();
    expect(task).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      d.resolve({ ok: true, data: null });
      await first;
    });
    expect(result.current.busy).toBe(false);
  });

  it('失敗時はメッセージを保持し、次の実行で消える', async () => {
    const { result } = await renderHook(() => useSubmit());
    await act(async () => {
      await result.current.run(async () => failure('invalid_credentials'));
    });
    expect(result.current.error).toContain('正しくありません');
    await act(async () => {
      await result.current.run(async () => ({ ok: true as const, data: null }));
    });
    expect(result.current.error).toBeNull();
  });

  it('キャンセルはエラー表示にしない', async () => {
    const { result } = await renderHook(() => useSubmit());
    await act(async () => {
      await result.current.run(async () => failure('cancelled'));
    });
    expect(result.current.error).toBeNull();
  });
});
