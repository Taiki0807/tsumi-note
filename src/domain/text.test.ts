import { toNFC } from './text';

describe('toNFC', () => {
  it('composes decomposed 濁点・半濁点 kana', () => {
    expect(toNFC('ぺ')).toBe('ぺ'); // へ + ゜ → ぺ
    expect(toNFC('ペ')).toBe('ペ'); // ヘ + ゜ → ペ
    expect(toNFC('が')).toBe('が'); // か + ゛ → が
  });

  it('keeps composed and plain text unchanged', () => {
    for (const s of ['ぺ', 'ペ', 'ぱぴぷぺぽ', 'がぎぐげご', 'abc 123', '']) {
      expect(toNFC(s)).toBe(s);
    }
  });
});
