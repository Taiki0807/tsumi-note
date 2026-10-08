import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json に環境変数由来の値を足す。
 * Google ログインの iOS クライアントID(EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)が設定されている場合のみ、
 * リダイレクト用の逆順ドメイン URL scheme を Info.plist に登録する。未設定なら何も追加しない。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const suffix = '.apps.googleusercontent.com';
  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const googleScheme =
    googleClientId && googleClientId.endsWith(suffix) && googleClientId.length > suffix.length
      ? `com.googleusercontent.apps.${googleClientId.slice(0, -suffix.length)}`
      : null;

  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(googleScheme ? { CFBundleURLTypes: [{ CFBundleURLSchemes: [googleScheme] }] } : {}),
      },
    },
  };
};
