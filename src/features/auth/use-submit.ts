import { useCallback, useRef, useState } from 'react';

import type { AuthResult } from './auth-api';

/**
 * 送信処理の共通フック。実行中は再実行を無視する(二重送信防止)。
 * state だけだと同一フレームの連打を防げないため ref でも保護する。
 */
export function useSubmit() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(task: () => Promise<AuthResult<T>>): Promise<AuthResult<T> | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await task();
      // キャンセルはエラー表示しない
      if (!result.ok && result.kind !== 'cancelled') setError(result.message);
      return result;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
