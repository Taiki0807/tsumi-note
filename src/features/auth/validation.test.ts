import {
  checkPassword,
  normalizeEmail,
  validateConfirmation,
  validateEmail,
  validateNewPassword,
} from './validation';

describe('validateEmail', () => {
  it('空・形式不正を拒否する', () => {
    expect(validateEmail('')).not.toBeNull();
    expect(validateEmail('   ')).not.toBeNull();
    expect(validateEmail('taiki')).not.toBeNull();
    expect(validateEmail('a b@example.com')).not.toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
  });
  it('正しい形式を受け付け、前後の空白は無視する', () => {
    expect(validateEmail('taiki@example.com')).toBeNull();
    expect(validateEmail('  taiki@example.com ')).toBeNull();
  });
  it('正規化すると小文字・トリムされる', () => {
    expect(normalizeEmail('  Taiki@Example.COM ')).toBe('taiki@example.com');
  });
});

describe('validateNewPassword(APIのパスワードポリシーと同じ)', () => {
  it('10文字未満・129文字以上を拒否する', () => {
    expect(validateNewPassword('abc12345')).toContain('10文字以上');
    expect(validateNewPassword('a1'.repeat(65))).toContain('128文字以内');
  });
  it('英字と数字の両方を要求する', () => {
    expect(validateNewPassword('abcdefghijkl')).toContain('英字と数字');
    expect(validateNewPassword('123456789012')).toContain('英字と数字');
  });
  it('メールアドレスのローカル部を含むパスワードを拒否する', () => {
    expect(validateNewPassword('learner-note-2026', 'learner@example.com')).toContain('メールアドレス');
    // 短いローカル部(4文字未満)は判定対象外
    expect(validateNewPassword('abc-note-2026', 'abc@example.com')).toBeNull();
  });
  it('空は入力を促す', () => {
    expect(validateNewPassword('')).toContain('入力');
  });
  it('条件を満たすパスワードを受け付ける', () => {
    expect(validateNewPassword('study-note-2026', 'learner@example.com')).toBeNull();
  });
});

describe('checkPassword / validateConfirmation', () => {
  it('条件ごとの判定を返す', () => {
    expect(checkPassword('short1', 'a@b.co')).toEqual({ length: false, mixed: true, noEmailPart: true });
    expect(checkPassword('learner-note-2026', 'learner@example.com').noEmailPart).toBe(false);
  });
  it('確認欄の不一致を検出する', () => {
    expect(validateConfirmation('a', 'b')).not.toBeNull();
    expect(validateConfirmation('a', 'a')).toBeNull();
  });
});
