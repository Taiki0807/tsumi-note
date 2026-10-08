/**
 * Goal (PRODUCT_SPEC §8 / Figma 06 目標): v1 manages a single active goal.
 * 資格 / 試験名, 受験日, 目標, 目的, 行動プラン. The action plan is stored as one item per line.
 */
import { isValidExamDay } from './exam-day';

export * from './exam-day';

export type GoalInput = {
  title: string;
  /**
   * Exam calendar day `YYYY-MM-DD` (no time / timezone), or null to clear it. `undefined` means "the
   * exam day is not part of this update": the stored `examDay` / legacy `examDate` are kept as they are.
   */
  examDay?: string | null;
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
    ...(input.examDay !== undefined ? { examDay: input.examDay } : {}),
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
    (goal.examDay === undefined || goal.examDay === null || isValidExamDay(goal.examDay))
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
