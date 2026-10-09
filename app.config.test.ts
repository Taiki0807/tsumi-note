import type { ConfigContext } from 'expo/config';

import withConfig, { googleReverseScheme, mergeUrlTypes } from './app.config';

const GOOGLE = 'com.googleusercontent.apps.123-abc';

const schemesOf = (types: { CFBundleURLSchemes?: string[] }[] | undefined) =>
  (types ?? []).flatMap((t) => t.CFBundleURLSchemes ?? []);

describe('googleReverseScheme', () => {
  it('クライアントIDを逆順ドメイン scheme にする', () => {
    expect(googleReverseScheme('123-abc.apps.googleusercontent.com')).toBe(GOOGLE);
  });
  it('未設定・不正値は null', () => {
    expect(googleReverseScheme(undefined)).toBeNull();
    expect(googleReverseScheme('')).toBeNull();
    expect(googleReverseScheme('.apps.googleusercontent.com')).toBeNull();
    expect(googleReverseScheme('foo')).toBeNull();
  });
});

describe('mergeUrlTypes', () => {
  it('Google 未設定かつ既存なしなら何も返さない(Expo 標準に任せる)', () => {
    expect(mergeUrlTypes(undefined, 'tsumi-note', null)).toBeUndefined();
  });
  it('scheme が文字列でも tsumi-note と Google が共存する', () => {
    expect(schemesOf(mergeUrlTypes(undefined, 'tsumi-note', GOOGLE))).toEqual([
      'tsumi-note',
      GOOGLE,
    ]);
  });
  it('scheme が配列でも共存する', () => {
    expect(schemesOf(mergeUrlTypes(undefined, ['tsumi-note', 'other'], GOOGLE))).toEqual([
      'tsumi-note',
      'other',
      GOOGLE,
    ]);
  });
  it('scheme 未設定でも Google は登録される', () => {
    expect(schemesOf(mergeUrlTypes(undefined, undefined, GOOGLE))).toEqual([GOOGLE]);
  });
  it('既存の CFBundleURLTypes を保持し、重複登録しない', () => {
    const existing = [{ CFBundleURLName: 'x', CFBundleURLSchemes: ['tsumi-note', GOOGLE] }];
    expect(mergeUrlTypes(existing, 'tsumi-note', GOOGLE)).toEqual(existing);
  });
  it('既存のみ(Google 未設定)でも config.scheme を補う', () => {
    const existing = [{ CFBundleURLSchemes: ['legacy'] }];
    const merged = mergeUrlTypes(existing, 'tsumi-note', null);
    expect(merged?.[0]).toBe(existing[0]);
    expect(schemesOf(merged)).toEqual(['legacy', 'tsumi-note']);
  });
});

describe('app.config', () => {
  const original = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = original;
  });

  const run = () =>
    withConfig({
      config: {
        name: 'x',
        slug: 'x',
        scheme: 'tsumi-note',
        ios: { bundleIdentifier: 'dev.hosokawalab.tsuminote', infoPlist: { Foo: 'bar' } },
      },
    } as unknown as ConfigContext);

  it('Google ID あり: 両 scheme が入り、他の infoPlist・ios 設定を保持する', () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = '123-abc.apps.googleusercontent.com';
    const ios = run().ios;
    expect(schemesOf(ios?.infoPlist?.CFBundleURLTypes)).toEqual(['tsumi-note', GOOGLE]);
    expect(ios?.infoPlist?.Foo).toBe('bar');
    expect(ios?.bundleIdentifier).toBe('dev.hosokawalab.tsuminote');
  });
  it('Google ID なし: CFBundleURLTypes を設定せず config.scheme が残る', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    const cfg = run();
    expect(cfg.ios?.infoPlist?.CFBundleURLTypes).toBeUndefined();
    expect(cfg.scheme).toBe('tsumi-note');
  });
});
