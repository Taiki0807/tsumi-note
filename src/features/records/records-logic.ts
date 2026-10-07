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

function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** `folderId` undefined = all folders. */
function inRange(sessions: SessionLike[], from: number, to: number, folderId?: string) {
  return sessions.filter(
    (s) => s.startedAt >= from && s.startedAt < to && (folderId === undefined || s.folderId === folderId),
  );
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
  for (const s of current) {
    const day = days.find(
      (d, i) => s.startedAt >= d.dayStart && s.startedAt < (days[i + 1]?.dayStart ?? weekEnd),
    );
    if (day) day.seconds += s.durationSeconds;
  }

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

/** e.g. 「9/7（月）– 9/13（日）」 (the Sunday is the last day of the week, not the exclusive end). */
export function formatWeekRange(weekStart: number): string {
  const first = new Date(weekStart);
  const last = new Date(addDays(weekStart, 6));
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[(d.getDay() + 6) % 7]}）`;
  return `${fmt(first)} – ${fmt(last)}`;
}

export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
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
