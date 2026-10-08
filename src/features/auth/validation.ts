/**
 * 認証フォームの入力検証。パスワードポリシーは API(api/src/password-policy.ts)と同一にする。
 * API側でも必ず検証されるため、ここは入力ミスを早く知らせるためのもの。
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (email.length === 0) return 'メールアドレスを入力してください。';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'メールアドレスの形式が正しくありません。';
  return null;
}

export type PasswordChecks = { length: boolean; mixed: boolean; noEmailPart: boolean };

export function checkPassword(password: string, email: string): PasswordChecks {
  const local = email.split('@')[0]?.trim().toLowerCase() ?? '';
  return {
    length: password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH,
    mixed: /[A-Za-z]/.test(password) && /[0-9]/.test(password),
    noEmailPart: !(local.length >= 4 && password.toLowerCase().includes(local)),
  };
}

export function validateNewPassword(password: string, email = ''): string | null {
  if (password.length === 0) return 'パスワードを入力してください。';
  if (password.length < MIN_PASSWORD_LENGTH)
    return `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。`;
  if (password.length > MAX_PASSWORD_LENGTH)
    return `パスワードは${MAX_PASSWORD_LENGTH}文字以内にしてください。`;
  const checks = checkPassword(password, email);
  if (!checks.mixed) return 'パスワードには英字と数字の両方を含めてください。';
  if (!checks.noEmailPart) return 'パスワードにメールアドレスの一部を含めないでください。';
  return null;
}

export function validateConfirmation(password: string, confirmation: string): string | null {
  return password === confirmation ? null : 'パスワードが一致しません。';
}
