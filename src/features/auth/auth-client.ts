import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { readAuthConfig } from './config';

/**
 * Better Auth クライアント。セッション(Cookie)は expo-secure-store(Keychain)にだけ保存し、
 * AsyncStorage や平文ログには置かない。APIのURLが未設定なら null(認証機能なし=ゲスト利用のみ)。
 */
function createClient() {
  const config = readAuthConfig();
  if (!config.apiUrl) return null;
  return createAuthClient({
    baseURL: config.apiUrl,
    plugins: [
      expoClient({
        scheme: config.scheme,
        storagePrefix: config.scheme,
        storage: SecureStore,
      }),
    ],
  });
}

export const authClient = createClient();
export type AppAuthClient = NonNullable<typeof authClient>;
