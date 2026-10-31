import { Linking } from 'react-native';

/** 公開中の利用規約・プライバシーポリシー(LP側で公開。PRODUCT_SPEC §17 Privacy / Data) */
export const TERMS_URL = 'https://tsumi-note.hosokawa-lab.dev/terms';
export const PRIVACY_URL = 'https://tsumi-note.hosokawa-lab.dev/privacy';
/** 外部連携APIの公開ドキュメント(LP側で公開。Figma 16c「APIドキュメントを見る」) */
export const API_DOCS_URL = 'https://tsumi-note.hosokawa-lab.dev/api';

/** 外部ブラウザで開く。開けない場合は何もしない(画面の操作を妨げない) */
export function openLegalUrl(url: string): void {
  void Linking.openURL(url).catch(() => {});
}
