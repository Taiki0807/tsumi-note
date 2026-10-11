import { Linking } from 'react-native';

/** 公開中の利用規約・プライバシーポリシー(LP側で公開。PRODUCT_SPEC §17 Privacy / Data) */
export const TERMS_URL = 'https://tsumi-note.hosokawa-lab.dev/terms';
export const PRIVACY_URL = 'https://tsumi-note.hosokawa-lab.dev/privacy';

/** 外部ブラウザで開く。開けない場合は何もしない(画面の操作を妨げない) */
export function openLegalUrl(url: string): void {
  void Linking.openURL(url).catch(() => {});
}
