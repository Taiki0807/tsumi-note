import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';

import { failure, type AuthResult } from './auth-api';

/**
 * Apple / Google のネイティブ認証。どちらも「IDトークンを取得してAPIへ渡す」方式で、
 * ブラウザ経由でセッションをdeep linkに載せる方式は使わない(API側でも拒否している)。
 * - 認可コードフローは PKCE + state(AuthRequest が生成・検証)
 * - nonce はログイン試行ごとに生成し、IDトークンの nonce と API 側で照合する
 */
export type IdTokenResult = { token: string; nonce: string };

function randomNonce(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Google の iOS クライアントIDからリダイレクトURI(逆順ドメインのscheme)を作る */
export function googleRedirectUri(clientId: string): string | null {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix) || clientId.length === suffix.length) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}:/oauthredirect`;
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAppleIdToken(): Promise<AuthResult<IdTokenResult>> {
  const nonce = randomNonce();
  try {
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
    if (!credential.identityToken) return failure('unknown', 'Appleから認証情報を取得できませんでした。');
    return { ok: true, data: { token: credential.identityToken, nonce } };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return failure('cancelled');
    return failure('unknown', 'Appleでサインインできませんでした。もう一度お試しください。');
  }
}

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export async function getGoogleIdToken(clientId: string | null): Promise<AuthResult<IdTokenResult>> {
  const redirectUri = clientId ? googleRedirectUri(clientId) : null;
  if (!clientId || !redirectUri) return failure('unavailable');
  const nonce = randomNonce();
  try {
    const request = new AuthSession.AuthRequest({
      clientId,
      redirectUri,
      scopes: ['openid', 'email', 'profile'],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { nonce },
    });
    const result = await request.promptAsync(GOOGLE_DISCOVERY);
    if (result.type === 'cancel' || result.type === 'dismiss') return failure('cancelled');
    // state の不一致などは AuthRequest が error として返す
    if (result.type !== 'success' || !request.codeVerifier) {
      return failure('unknown', 'Googleでログインできませんでした。もう一度お試しください。');
    }
    const tokens = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code: result.params.code ?? '',
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      },
      GOOGLE_DISCOVERY,
    );
    if (!tokens.idToken) return failure('unknown', 'Googleから認証情報を取得できませんでした。');
    return { ok: true, data: { token: tokens.idToken, nonce } };
  } catch {
    return failure('network');
  }
}
