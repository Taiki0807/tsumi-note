import { buildDayRecord, type DaySession } from './day-record';

const s = (id: string, folderId: string | null, startedAt: number, minutes: number): DaySession => ({
  id,
  folderId,
  startedAt,
  endedAt: startedAt + minutes * 60_000,
  durationSeconds: minutes * 60,
});

const folders = [
  { id: 'a', name: '韓国語' },
  { id: 'b', name: '簿記2級' },
];

describe('buildDayRecord', () => {
  it('is empty for a day without sessions', () => {
    expect(buildDayRecord([], folders)).toEqual({ totalSeconds: 0, sessions: [], shares: [] });
  });

  it('sorts sessions by start time and totals them', () => {
    const r = buildDayRecord([s('2', 'b', 2000, 25), s('1', 'a', 1000, 25), s('3', 'a', 3000, 25)], folders);
    expect(r.sessions.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(r.totalSeconds).toBe(75 * 60);
  });

  it('splits time per folder in folder-list order with 未分類 last', () => {
    const r = buildDayRecord([s('1', null, 1000, 10), s('2', 'b', 2000, 25), s('3', 'a', 3000, 50)], folders);
    expect(r.shares).toEqual([
      { folderId: 'a', seconds: 50 * 60 },
      { folderId: 'b', seconds: 25 * 60 },
      { folderId: null, seconds: 10 * 60 },
    ]);
  });

  it('keeps time of a folder missing from the list', () => {
    const r = buildDayRecord([s('1', 'gone', 1000, 10)], folders);
    expect(r.shares).toEqual([{ folderId: 'gone', seconds: 600 }]);
    expect(r.totalSeconds).toBe(600);
  });
});
