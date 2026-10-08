/**
 * 受験日 (PRODUCT_SPEC §8) as a calendar day `YYYY-MM-DD`, not an instant: it carries no time or
 * timezone, so the date shown and counted down never shifts when the device timezone changes.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Builds `YYYY-MM-DD` from a picked year / month (1-12) / day; null for a non-existent date (e.g. 2月30日). */
export function makeExamDay(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger) || year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Splits a stored day; undefined when malformed or not a real date. */
export function parseExamDay(text: string): { year: number; month: number; day: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return makeExamDay(year, month, day) === text ? { year, month, day } : undefined;
}

export function isValidExamDay(text: string): boolean {
  return parseExamDay(text) !== undefined;
}

/** The device's current calendar day (the only place the local timezone is consulted). */
export function localToday(now: number): string {
  const d = new Date(now);
  return makeExamDay(d.getFullYear(), d.getMonth() + 1, d.getDate()) as string;
}

/** Calendar days from today (the local date of `now`) to the exam day (0 = today, negative = passed). */
export function daysUntilExam(examDay: string | null, now: number): number | null {
  const exam = examDay === null ? undefined : parseExamDay(examDay);
  const today = parseExamDay(localToday(now));
  if (!exam || !today) return null;
  // UTC arithmetic on pure dates: no DST or timezone effects.
  const diff =
    Date.UTC(exam.year, exam.month - 1, exam.day) - Date.UTC(today.year, today.month - 1, today.day);
  return Math.round(diff / DAY_MS);
}

/** Figma: 2026年11月15日 */
export function formatExamDate(examDay: string): string {
  const parsed = parseExamDay(examDay);
  return parsed ? `${parsed.year}年${parsed.month}月${parsed.day}日` : '';
}

export type LegacyEpochResolution =
  | { kind: 'day'; day: string }
  /** More than one real UTC offset yields this epoch, so the original day is not unique. */
  | { kind: 'ambiguous'; candidates: string[] }
  /** Not a local midnight at any real offset (corrupt / foreign value). */
  | { kind: 'unrecoverable' };

const HOUR_MS = 60 * 60 * 1000;
/** Real-world UTC offsets range from UTC-12 to UTC+14 in 15-minute steps. */
const MIN_OFFSET = -12 * HOUR_MS;
const MAX_OFFSET = 14 * HOUR_MS;

/**
 * Interprets a legacy `exam_date` (epoch ms of the creating device's local midnight, written before
 * migration 0003). The source timezone was not stored, but a local-midnight instant encodes its own UTC
 * offset: `epoch mod 1 day` equals `-offset mod 1 day`, so the original date is recoverable without the
 * current device timezone, **but only when exactly one real offset fits**. Each remainder admits the
 * offsets `o` and `o - 24h`; both are real only for remainders 10h / 11h / 12h (UTC-10 vs +14,
 * UTC-11 vs +13, UTC-12 vs +12). Those are reported as ambiguous instead of guessing a day.
 */
export function resolveLegacyEpoch(epoch: number): LegacyEpochResolution {
  if (!Number.isFinite(epoch)) return { kind: 'unrecoverable' };
  const rem = ((epoch % DAY_MS) + DAY_MS) % DAY_MS;
  if (rem % (15 * 60 * 1000) !== 0) return { kind: 'unrecoverable' };
  const base = (DAY_MS - rem) % DAY_MS;
  const days = [base, base - DAY_MS]
    .filter((offset) => offset >= MIN_OFFSET && offset <= MAX_OFFSET)
    .map((offset) => {
      const date = new Date(epoch + offset);
      return makeExamDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    })
    .filter((day): day is string => day !== null);
  if (days.length === 1) return { kind: 'day', day: days[0] as string };
  return days.length > 1 ? { kind: 'ambiguous', candidates: days } : { kind: 'unrecoverable' };
}

/** The unique original day of a legacy epoch, or null when it cannot be determined without guessing. */
export function legacyEpochToExamDay(epoch: number): string | null {
  const resolved = resolveLegacyEpoch(epoch);
  return resolved.kind === 'day' ? resolved.day : null;
}

/** Month grid for the calendar: Sunday-first weeks of day numbers, 0 = padding. */
export function buildMonthGrid(year: number, month: number): number[][] {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells = [
    ...Array<number>(lead).fill(0),
    ...Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(0);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
