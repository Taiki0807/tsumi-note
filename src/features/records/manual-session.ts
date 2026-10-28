import { parseReminderTime } from '@/domain/app-settings';

import { addDays } from './records-logic';

/** Longest single record (24h): guards against typos such as 00:00–23:59 entered by accident twice. */
export const MAX_MANUAL_SESSION_SECONDS = 24 * 60 * 60;

export type ManualSessionInput = {
  /** Local 00:00 of the day studied. */
  dayStart: number;
  /** `HH:mm` (24h). */
  start: string;
  end: string;
};

export type ManualSessionResult =
  { ok: true; startedAt: number; endedAt: number; durationSeconds: number } | { ok: false; error: string };

function atTime(dayStart: number, time: { hour: number; minute: number }): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute).getTime();
}

/**
 * Validates the 「記録を追加」 form (no timer). The session must start and end on the chosen local day
 * (end after start) and must not end in the future. `now` is injected for testing.
 */
export function buildManualSession(input: ManualSessionInput, now: number): ManualSessionResult {
  const start = parseReminderTime(input.start);
  const end = parseReminderTime(input.end);
  if (!start || !end) return { ok: false, error: '時刻は 00:00〜23:59 の形式で入力してください' };
  const startedAt = atTime(input.dayStart, start);
  const endedAt = atTime(input.dayStart, end);
  if (endedAt <= startedAt) return { ok: false, error: '終了時刻は開始時刻より後にしてください' };
  if (endedAt > now) return { ok: false, error: '未来の時刻は記録できません' };
  const durationSeconds = Math.round((endedAt - startedAt) / 1000);
  if (durationSeconds > MAX_MANUAL_SESSION_SECONDS)
    return { ok: false, error: '24時間を超える記録はできません' };
  return { ok: true, startedAt, endedAt, durationSeconds };
}

/** Selectable days of the form: today and the previous 6 days (local midnights, newest first). */
export function recentDays(todayStart: number, count = 7): number[] {
  return Array.from({ length: count }, (_, i) => addDays(todayStart, -i));
}

/** `HH:mm` of an epoch ms in local time. */
export function formatClock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** e.g. 「9:30–10:05」 shown on a session row. */
export function formatSessionRange(startedAt: number, endedAt: number): string {
  return `${formatClock(startedAt)}–${formatClock(endedAt)}`;
}
