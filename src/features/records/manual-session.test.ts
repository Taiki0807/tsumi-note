import { buildManualSession, formatSessionRange, recentDays } from './manual-session';
import { buildWeeklyRecord, folderColorIndex, startOfWeek, summarizeDayByFolder } from './records-logic';

const local = (m: number, d: number, h = 0, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const DAY = local(10, 28);
const NOW = local(10, 28, 18, 0);

describe('buildManualSession', () => {
  it('builds a session from the chosen local day and HH:mm times', () => {
    expect(buildManualSession({ dayStart: DAY, start: '9:30', end: '10:05' }, NOW)).toEqual({
      ok: true,
      startedAt: local(10, 28, 9, 30),
      endedAt: local(10, 28, 10, 5),
      durationSeconds: 35 * 60,
    });
  });

  it('rejects malformed times, end <= start and the future', () => {
    expect(buildManualSession({ dayStart: DAY, start: '25:00', end: '10:00' }, NOW).ok).toBe(false);
    expect(buildManualSession({ dayStart: DAY, start: '', end: '10:00' }, NOW).ok).toBe(false);
    expect(buildManualSession({ dayStart: DAY, start: '10:00', end: '10:00' }, NOW).ok).toBe(false);
    expect(buildManualSession({ dayStart: DAY, start: '11:00', end: '10:00' }, NOW).ok).toBe(false);
    expect(buildManualSession({ dayStart: DAY, start: '17:00', end: '18:01' }, NOW).ok).toBe(false);
    expect(buildManualSession({ dayStart: DAY, start: '17:00', end: '18:00' }, NOW).ok).toBe(true);
  });

  it('lists today and the previous days, and formats the range', () => {
    const days = recentDays(DAY, 3);
    expect(days).toEqual([DAY, local(10, 27), local(10, 26)]);
    expect(formatSessionRange(local(10, 28, 9, 5), local(10, 28, 10, 30))).toBe('09:05–10:30');
  });
});

describe('per-folder chart segments', () => {
  const s = (folderId: string | null, h: number, min: number) => ({
    folderId,
    startedAt: local(10, 28, h, min),
    durationSeconds: 600,
  });

  it('splits a day by folder in folder-list order, 未分類 last', () => {
    const segments = summarizeDayByFolder([s(null, 8, 0), s('b', 9, 0), s('a', 10, 0), s('b', 11, 0)], DAY, [
      'a',
      'b',
    ]);
    expect(segments).toEqual([
      { folderId: 'a', seconds: 600 },
      { folderId: 'b', seconds: 1200 },
      { folderId: null, seconds: 600 },
    ]);
  });

  it('keeps day.seconds equal to the sum of its segments in a weekly record', () => {
    const week = startOfWeek(DAY);
    const record = buildWeeklyRecord([s('a', 9, 0), s(null, 10, 0)], week, undefined, ['a']);
    const day = record.days.find((d) => d.dayStart === DAY);
    expect(day?.seconds).toBe(1200);
    expect(day?.segments.reduce((sum, x) => sum + x.seconds, 0)).toBe(1200);
  });

  it('gives 未分類 / unknown folders index -1', () => {
    expect(folderColorIndex(['a', 'b'], 'b')).toBe(1);
    expect(folderColorIndex(['a', 'b'], null)).toBe(-1);
    expect(folderColorIndex(['a', 'b'], 'zzz')).toBe(-1);
  });
});
