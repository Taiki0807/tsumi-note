export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * パスワードポリシー。違反時は利用者向けの日本語メッセージを返し、OKなら null。
 * - 10〜128文字
 * - 英字と数字をそれぞれ1文字以上
 * - メールアドレスのローカル部を含まない
 */
export function validatePassword(password: unknown, email?: unknown): string | null {
  if (typeof password !== 'string') return 'パスワードを入力してください。';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `パスワードは${MAX_PASSWORD_LENGTH}文字以内にしてください。`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'パスワードには英字と数字の両方を含めてください。';
  }
  if (typeof email === 'string') {
    const local = email.split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 4 && password.toLowerCase().includes(local)) {
      return 'パスワードにメールアドレスの一部を含めないでください。';
    }
  }
  return null;
}
