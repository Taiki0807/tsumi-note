/**
 * Goal (PRODUCT_SPEC §8 / Figma 06 目標): v1 manages a single active goal.
 * 資格 / 試験名, 受験日, 目標, 目的, 行動プラン. The action plan is stored as one item per line.
 */
export type GoalInput = {
  title: string;
  /** Epoch ms of the exam day (local midnight), or null when undecided. */
  examDate: number | null;
  objective: string;
  purpose: string;
  actionPlan: string;
};

export const GOAL_LIMITS = {
  title: 60,
  objective: 200,
  purpose: 200,
  actionPlanItem: 100,
  actionPlanItems: 20,
} as const;

/** Returns trimmed values; empty title is rejected by {@link validateGoal}. */
export function normalizeGoal(input: GoalInput): GoalInput {
  return {
    title: input.title.trim(),
    examDate: input.examDate,
    objective: input.objective.trim(),
    purpose: input.purpose.trim(),
    actionPlan: parseActionPlan(input.actionPlan).join('\n'),
  };
}

export function validateGoal(input: GoalInput): boolean {
  const goal = normalizeGoal(input);
  const items = parseActionPlan(goal.actionPlan);
  return (
    goal.title.length > 0 &&
    goal.title.length <= GOAL_LIMITS.title &&
    goal.objective.length <= GOAL_LIMITS.objective &&
    goal.purpose.length <= GOAL_LIMITS.purpose &&
    items.length <= GOAL_LIMITS.actionPlanItems &&
    items.every((item) => item.length <= GOAL_LIMITS.actionPlanItem) &&
    (goal.examDate === null || Number.isFinite(goal.examDate))
  );
}

/** One non-empty trimmed item per line. */
export function parseActionPlan(actionPlan: string): string[] {
  return actionPlan
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function startOfLocalDay(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days from `now`'s date to the exam date (0 = today, negative = passed); null without a date. */
export function daysUntilExam(examDate: number | null, now: number): number | null {
  if (examDate === null) return null;
  const DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfLocalDay(examDate) - startOfLocalDay(now)) / DAY);
}

/** Figma: 2026年11月15日 */
export function formatExamDate(examDate: number): string {
  const date = new Date(examDate);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** Parses `YYYY-MM-DD` (and `YYYY/M/D`) as a real local date; null when empty or not a valid date. */
export function parseExamDateInput(text: string): number | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? date.getTime() : null;
}

export function formatExamDateInput(examDate: number | null): string {
  if (examDate === null) return '';
  const date = new Date(examDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
