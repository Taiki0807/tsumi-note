/**
 * Domain validation for Folder / Question input (Phase 4).
 * Repositories always run these, so invalid data can never reach SQLite regardless of the UI.
 */

export type ValidationField = 'folderName' | 'prompt' | 'answer';

export class ValidationError extends Error {
  readonly field: ValidationField;

  constructor(field: ValidationField, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const FIELD_MESSAGES: Record<ValidationField, string> = {
  folderName: 'フォルダー名を入力してください',
  prompt: '問題を入力してください',
  answer: '答えを入力してください',
};

function requireText(field: ValidationField, raw: string): string {
  const value = raw.trim();
  if (value === '') throw new ValidationError(field, FIELD_MESSAGES[field]);
  return value;
}

/** Trims surrounding whitespace; throws `ValidationError` when nothing is left. */
export function normalizeFolderName(raw: string): string {
  return requireText('folderName', raw);
}

export function normalizeQuestionInput(input: { prompt: string; answer: string }): {
  prompt: string;
  answer: string;
} {
  return { prompt: requireText('prompt', input.prompt), answer: requireText('answer', input.answer) };
}

/** Non-throwing check for disabling save buttons. */
export function isBlank(raw: string): boolean {
  return raw.trim() === '';
}
