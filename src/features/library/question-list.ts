import type { AnswerStats, Question } from '@/db/repositories';

/** Figma 08 SegmentedTabs: すべて / 復習待ち / 苦手. */
export type QuestionFilter = 'all' | 'due' | 'weak';

export type QuestionRow = {
  question: Question;
  attempts: number;
  incorrect: number;
  /** incorrect / attempts, or `null` for a question that was never answered. */
  incorrectRate: number | null;
  isDue: boolean;
};

/**
 * 苦手: answered at least twice and wrong at least half of the time.
 * Neither Figma nor PRODUCT_SPEC defines the threshold; it is a guess, kept in one place.
 */
export const WEAK_MIN_ATTEMPTS = 2;
export const WEAK_MIN_RATE = 0.5;

export function isWeak(row: Pick<QuestionRow, 'attempts' | 'incorrectRate'>): boolean {
  return row.attempts >= WEAK_MIN_ATTEMPTS && (row.incorrectRate ?? 0) >= WEAK_MIN_RATE;
}

export function toQuestionRow(
  question: Question,
  stats: AnswerStats | undefined,
  isDue: boolean,
): QuestionRow {
  const attempts = stats?.attempts ?? 0;
  const incorrect = stats?.incorrect ?? 0;
  return { question, attempts, incorrect, incorrectRate: attempts > 0 ? incorrect / attempts : null, isDue };
}

export function filterRows(rows: QuestionRow[], filter: QuestionFilter): QuestionRow[] {
  if (filter === 'due') return rows.filter((r) => r.isDue);
  if (filter === 'weak') return rows.filter(isWeak);
  return rows;
}

/** Figma 08「誤答率の高い順」: highest rate first, never-answered last, then newest first. */
export function sortByIncorrectRate(rows: QuestionRow[]): QuestionRow[] {
  return [...rows].sort(
    (a, b) =>
      (b.incorrectRate ?? -1) - (a.incorrectRate ?? -1) ||
      b.incorrect - a.incorrect ||
      b.question.createdAt - a.question.createdAt ||
      a.question.id.localeCompare(b.question.id),
  );
}

export function incorrectPercent(row: Pick<QuestionRow, 'incorrectRate'>): number | null {
  return row.incorrectRate === null ? null : Math.round(row.incorrectRate * 100);
}
