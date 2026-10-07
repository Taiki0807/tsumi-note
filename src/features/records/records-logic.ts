/**
 * Study record aggregation (PRODUCT_SPEC §6). Pure functions only: no React, no DB.
 *
 * Rules (also documented in the PR):
 * - Day / week boundaries use the device's LOCAL time zone (never the UTC date).
 * - A week starts on Monday and ends on Sunday (Figma: 「9/7（月）– 9/13（日）」).
 * - A session belongs to the local day of its `startedAt`; its whole `durationSeconds` is counted
 *   there, even when it runs past midnight.
 * - Boundaries are computed with calendar arithmetic (`new Date(y, m, d + n)`), not `+ 86_400_000`,
 *   so DST changes and month / year rollovers stay correct.
 */

export type SessionLike = {
  folderId: string | null;
  startedAt: number;
  durationSeconds: number;
};

export type DayRecord = {
  /** Epoch ms of local 00:00 of this day. */
  dayStart: number;
  /** 0 = Monday ... 6 = Sunday. */
  weekdayIndex: number;
  seconds: number;
};

export type WeeklyRecord = {
  /** Epoch ms of local Monday 00:00. */
  weekStart: number;
  /** Epoch ms of the next local Monday 00:00 (exclusive). */
  weekEnd: number;
  days: DayRecord[];
  totalSeconds: number;
  previousTotalSeconds: number;
  /** totalSeconds - previousTotalSeconds. */
  diffSeconds: number;
  sessionCount: number;
};

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

/** Local 00:00 of the day containing `at`. */
export function startOfLocalDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local Monday 00:00 of the week containing `at`. */
export function startOfWeek(at: number): number {
  const d = new Date(at);
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday).getTime();
}

/** Shifts a local midnight by whole calendar weeks (negative = past). */
export function addWeeks(weekStart: number, weeks: number): number {
  const d = new Date(weekStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + weeks * 7).getTime();
}

export function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** `folderId` undefined = all folders. */
function inRange(sessions: SessionLike[], from: number, to: number, folderId?: string) {
  return sessions.filter(
    (s) => s.startedAt >= from && s.startedAt < to && (folderId === undefined || s.folderId === folderId),
  );
}

export type DaySummary = { seconds: number; sessionCount: number };

/**
 * Total focus time and session count of the local day starting at `dayStart`. The single day
 * aggregation shared by the weekly chart and the timer screen's 「今日の集中」「完了」.
 */
export function summarizeDay(sessions: SessionLike[], dayStart: number, folderId?: string): DaySummary {
  const inDay = inRange(sessions, dayStart, addDays(dayStart, 1), folderId);
  return {
    seconds: inDay.reduce((sum, s) => sum + s.durationSeconds, 0),
    sessionCount: inDay.length,
  };
}

export function buildWeeklyRecord(
  sessions: SessionLike[],
  weekStart: number,
  folderId?: string,
): WeeklyRecord {
  const weekEnd = addWeeks(weekStart, 1);
  const previousStart = addWeeks(weekStart, -1);

  const current = inRange(sessions, weekStart, weekEnd, folderId);
  const previous = inRange(sessions, previousStart, weekStart, folderId);

  const days: DayRecord[] = Array.from({ length: 7 }, (_, i) => ({
    dayStart: addDays(weekStart, i),
    weekdayIndex: i,
    seconds: 0,
  }));
  for (const day of days) day.seconds = summarizeDay(current, day.dayStart).seconds;

  const totalSeconds = days.reduce((sum, d) => sum + d.seconds, 0);
  const previousTotalSeconds = previous.reduce((sum, s) => sum + s.durationSeconds, 0);
  return {
    weekStart,
    weekEnd,
    days,
    totalSeconds,
    previousTotalSeconds,
    diffSeconds: totalSeconds - previousTotalSeconds,
    sessionCount: current.length,
  };
}

export type AnswerLike = { result: 'correct' | 'incorrect' | 'timeout'; answeredAt: number };

/** 「今週の理解度」 (Figma 02): the three StatCards. */
export type Understanding = {
  /** correct + incorrect + timeout. */
  answerCount: number;
  correctCount: number;
  timeoutCount: number;
  /** correctCount / answerCount in 0..1; null when nothing was answered (shown as 「—」, not 0%). */
  correctRate: number | null;
};

/**
 * Aggregates Answer History of the week [weekStart, next Monday) - the same local-time week as the
 * study time. A timeout is counted as an answer but never as correct (PRODUCT_SPEC: 時間切れは
 * 不正解とは別に集計), so it lowers the rate without being counted as incorrect.
 */
export function buildUnderstanding(answers: AnswerLike[], weekStart: number): Understanding {
  const weekEnd = addWeeks(weekStart, 1);
  const inWeek = answers.filter((a) => a.answeredAt >= weekStart && a.answeredAt < weekEnd);
  const correctCount = inWeek.filter((a) => a.result === 'correct').length;
  const timeoutCount = inWeek.filter((a) => a.result === 'timeout').length;
  return {
    answerCount: inWeek.length,
    correctCount,
    timeoutCount,
    correctRate: inWeek.length === 0 ? null : correctCount / inWeek.length,
  };
}

/** e.g. 「75%」 (rounded to the nearest percent); no answers → 「—」. */
export function formatCorrectRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** e.g. 「9/7（月）– 9/13（日）」 (the Sunday is the last day of the week, not the exclusive end). */
export function formatWeekRange(weekStart: number): string {
  const first = new Date(weekStart);
  const last = new Date(addDays(weekStart, 6));
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[(d.getDay() + 6) % 7]}）`;
  return `${fmt(first)} – ${fmt(last)}`;
}

/** e.g. 「9/7–9/13」 (card subtitle of 「今週の理解度」). */
export function formatShortWeekRange(weekStart: number): string {
  const first = new Date(weekStart);
  const last = new Date(addDays(weekStart, 6));
  return `${first.getMonth() + 1}/${first.getDate()}–${last.getMonth() + 1}/${last.getDate()}`;
}

export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** Timer stat card value, e.g. 「75分」 (minutes are rounded down, like the weekly total). */
export function formatFocusMinutes(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)}分`;
}

/**
 * Label shown above a weekly chart bar, e.g. 「10分」. Minutes are rounded down like the weekly total;
 * days without records return null (no 「0分」 clutter), sub-minute days show 「<1分」.
 */
export function formatDayLabel(seconds: number): string | null {
  if (seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? '<1分' : `${minutes}分`;
}

export type DiffChip = { kind: 'up' | 'down' | 'same'; label: string };

/** Previous-week comparison chip, e.g. 「+45分 前週比」. Minutes are rounded to the nearest. */
export function formatDiff(diffSeconds: number): DiffChip {
  const minutes = Math.round(Math.abs(diffSeconds) / 60);
  if (minutes === 0) return { kind: 'same', label: '前週と同じ' };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const text = h > 0 ? `${h}時間${m > 0 ? `${m}分` : ''}` : `${m}分`;
  return diffSeconds > 0
    ? { kind: 'up', label: `+${text} 前週比` }
    : { kind: 'down', label: `-${text} 前週比` };
}

/**
 * Y-axis maximum in hours: an even number >= 2 that fits the tallest day, so the three grid
 * lines (0, max/2, max) always fall on whole hours like Figma's 0 / 1h / 2h.
 */
export function chartMaxHours(days: DayRecord[]): number {
  const maxHours = Math.max(0, ...days.map((d) => d.seconds)) / 3600;
  const ceil = Math.max(2, Math.ceil(maxHours));
  return ceil % 2 === 0 ? ceil : ceil + 1;
}
