import { useCallback, useRef, useState } from 'react';

import { failure } from './auth-api';
import { useAuth } from './auth-context';
import { getAppleIdToken, getGoogleIdToken, isAppleSignInAvailable } from './social-sign-in';

/** Apple / Google ログインの共通フック。実行中の再タップは無視し、キャンセルはエラーにしない */
export function useSocialSignIn() {
  const { api, configured, googleIosClientId } = useAuth();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (provider: 'apple' | 'google'): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(provider);
      setError(null);
      try {
        const token =
          provider === 'apple' ? await getAppleIdToken() : await getGoogleIdToken(googleIosClientId);
        if (!token.ok) {
          if (token.kind !== 'cancelled') setError(token.message);
          return false;
        }
        const result = await api.signInWithIdToken(provider, token.data.token, token.data.nonce);
        if (!result.ok) {
          setError(result.message);
          return false;
        }
        return true;
      } catch {
        setError(failure('unknown').message);
        return false;
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [api, googleIosClientId],
  );

  return {
    configured,
    googleReady: googleIosClientId !== null,
    busy,
    error,
    signIn,
    checkApple: isAppleSignInAvailable,
  };
}
