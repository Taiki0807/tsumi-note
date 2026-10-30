/**
 * Some third-party keyboards (e.g. Simeji) can deliver 濁点/半濁点 characters decomposed
 * (base kana + U+3099 / U+309A) instead of precomposed (ぺ = U+307A). Composing them (NFC) keeps
 * stored text, search and display consistent. Already-composed text is returned unchanged.
 */
export function toNFC(text: string): string {
  return text.normalize('NFC');
}
