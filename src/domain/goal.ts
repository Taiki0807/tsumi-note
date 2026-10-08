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

/** One non-empty trimmed item per line (the plain text typed in the edit form). */
export function parseActionPlan(actionPlan: string): string[] {
  return actionPlan
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 行動プラン check state lives in the stored `actionPlan` text itself, one task-list line per item
 * (`[ ] text` / `[x] text`, the same syntax as note checklists). Item and state are therefore always
 * written together in one row update (Local First / sync friendly) and need no extra column.
 */
export type PlanItem = { text: string; done: boolean };

/** Reads the stored format; a line without a marker (legacy / hand-written) is an unchecked item. */
export function parsePlanItems(stored: string): PlanItem[] {
  return parseActionPlan(stored).map((line) => {
    const match = /^\[([ xX])\]\s+(.*)$/.exec(line);
    return match ? { text: (match[2] ?? '').trim(), done: match[1] !== ' ' } : { text: line, done: false };
  });
}

export function serializePlanItems(items: PlanItem[]): string {
  return items.map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text}`).join('\n');
}

/** Plain text for the edit form (markers hidden). */
export function planEditText(stored: string): string {
  return parsePlanItems(stored)
    .map((item) => item.text)
    .join('\n');
}

/**
 * Applies an edit made in the form (plain lines) to the stored plan. An item whose text is unchanged
 * keeps its check state; new or reworded items start unchecked. Duplicates are matched in order.
 */
export function applyPlanEdit(previousStored: string, editedText: string): string {
  const previous = parsePlanItems(previousStored);
  const used = new Set<number>();
  const next = parseActionPlan(editedText).map((text) => {
    const index = previous.findIndex((item, i) => !used.has(i) && item.text === text);
    if (index >= 0) used.add(index);
    return { text, done: index >= 0 ? (previous[index]?.done ?? false) : false };
  });
  return serializePlanItems(next);
}

/** Flips one item's check state; every other item is untouched. Out-of-range indexes change nothing. */
export function togglePlanItem(stored: string, index: number): string {
  const items = parsePlanItems(stored);
  const item = items[index];
  if (!item) return serializePlanItems(items);
  return serializePlanItems(items.map((it, i) => (i === index ? { ...it, done: !it.done } : it)));
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
