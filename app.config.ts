import type { ConfigContext, ExpoConfig } from 'expo/config';

type UrlType = { CFBundleURLSchemes?: string[]; [key: string]: unknown };

const GOOGLE_SUFFIX = '.apps.googleusercontent.com';

export function googleReverseScheme(clientId: string | undefined): string | null {
  const id = clientId?.trim();
  return id && id.endsWith(GOOGLE_SUFFIX) && id.length > GOOGLE_SUFFIX.length
    ? `com.googleusercontent.apps.${id.slice(0, -GOOGLE_SUFFIX.length)}`
    : null;
}

/**
 * ios.infoPlist.CFBundleURLTypes を明示すると、Expo の withScheme は config.scheme を
 * Info.plist へ追加しない。そのため既存設定・config.scheme・Google scheme を重複なくマージする。
 * Google scheme が無く既存の CFBundleURLTypes も無い場合は何も返さず、Expo 標準の処理に任せる。
 */
export function mergeUrlTypes(
  existing: unknown,
  scheme: string | string[] | undefined,
  googleScheme: string | null,
): UrlType[] | undefined {
  const base: UrlType[] = Array.isArray(existing) ? (existing as UrlType[]) : [];
  if (!googleScheme && base.length === 0) return undefined;

  const appSchemes = (Array.isArray(scheme) ? scheme : scheme ? [scheme] : []).filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  const present = new Set(base.flatMap((t) => t.CFBundleURLSchemes ?? []));
  const candidates = [...appSchemes, ...(googleScheme ? [googleScheme] : [])];
  const missing = candidates.filter((s, i) => !present.has(s) && candidates.indexOf(s) === i);
  return missing.length > 0 ? [...base, { CFBundleURLSchemes: missing }] : base;
}

/**
 * app.json に環境変数由来の値を足す。
 * Google ログインの iOS クライアントID(EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)が設定されている場合のみ、
 * リダイレクト用の逆順ドメイン URL scheme を Info.plist に登録する(tsumi-note scheme は維持する)。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const urlTypes = mergeUrlTypes(
    config.ios?.infoPlist?.CFBundleURLTypes,
    config.scheme,
    googleReverseScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  );

  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(urlTypes ? { CFBundleURLTypes: urlTypes } : {}),
      },
    },
  };
};
