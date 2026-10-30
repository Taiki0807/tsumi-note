import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withXcodeProject, type XcodeProject } from 'expo/config-plugins';

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

const DEVELOPMENT_REGION = 'ja';

type PbxObject = Record<string, unknown>;

/**
 * Expo のテンプレートは Xcode プロジェクトの開発言語が en で、General の Display Name も空になる。
 * Xcode で手直ししても `expo prebuild --clean` で消えるため、prebuild 時に毎回設定する。
 * - PBXProject の developmentRegion を ja にし、knownRegions から en を外す(App Store の言語表示が英語になるのを防ぐ)
 * - アプリ target の INFOPLIST_KEY_CFBundleDisplayName に表示名を入れる(General の Display Name 欄)
 */
export function applyJapaneseProject(project: XcodeProject, displayName: string): XcodeProject {
  const objects = project.hash.project.objects as Record<string, Record<string, unknown>>;

  for (const p of Object.values(objects.PBXProject ?? {})) {
    if (typeof p !== 'object' || p === null) continue;
    const pbx = p as PbxObject;
    const known = Array.isArray(pbx.knownRegions) ? (pbx.knownRegions as string[]) : [];
    const rest = known.filter((r) => !['en', 'English', DEVELOPMENT_REGION, 'Base'].includes(r));
    pbx.developmentRegion = DEVELOPMENT_REGION;
    pbx.knownRegions = [DEVELOPMENT_REGION, 'Base', ...rest];
  }

  for (const c of Object.values(objects.XCBuildConfiguration ?? {})) {
    if (typeof c !== 'object' || c === null) continue;
    const settings = (c as PbxObject).buildSettings as PbxObject | undefined;
    // アプリ target の設定だけ(PROJECT 全体の設定には PRODUCT_NAME がない)
    if (!settings?.PRODUCT_NAME) continue;
    settings.INFOPLIST_KEY_CFBundleDisplayName = JSON.stringify(displayName);
  }
  return project;
}

/**
 * app.json に環境変数由来の値を足す。
 * Google ログインの iOS クライアントID(EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)が設定されている場合のみ、
 * リダイレクト用の逆順ドメイン URL scheme を Info.plist に登録する(tsumi-note scheme は維持する)。
 * あわせて Xcode プロジェクトの開発言語と表示名を設定する(applyJapaneseProject)。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const urlTypes = mergeUrlTypes(
    config.ios?.infoPlist?.CFBundleURLTypes,
    config.scheme,
    googleReverseScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  );

  const expoConfig: ExpoConfig = {
    ...(config as ExpoConfig),

    plugins: [...(config.plugins ?? []), 'expo-image'],

    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(urlTypes ? { CFBundleURLTypes: urlTypes } : {}),
      },
    },
  };

  return withXcodeProject(expoConfig, (c) => {
    c.modResults = applyJapaneseProject(c.modResults, c.name);
    return c;
  });
};
