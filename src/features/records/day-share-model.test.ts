import { buildDayShareModel, MAX_SHARE_FOLDER_ROWS, timelineBand } from './share-model';

const dayStart = new Date(2026, 10, 5).getTime(); // Thu 11/5
const at = (hour: number, minute = 0, dayOffset = 0) =>
  new Date(2026, 10, 5 + dayOffset, hour, minute).getTime();
const session = (
  folderId: string | null,
  start: number,
  end: number,
  durationSeconds = Math.round((end - start) / 1000),
) => ({ folderId, startedAt: start, endedAt: end, durationSeconds });

describe('timelineBand', () => {
  it('places 0:00, noon and 23:59 on the 24h axis', () => {
    expect(timelineBand(dayStart, at(0), at(6))).toEqual({ left: 0, width: 0.25 });
    expect(timelineBand(dayStart, at(12), at(18))).toEqual({ left: 0.5, width: 0.25 });
    const late = timelineBand(dayStart, at(23, 59), at(24));
    expect(late.left).toBeCloseTo(1439 / 1440);
    expect(late.left + late.width).toBeCloseTo(1);
  });

  it('clips a session that runs past midnight (or starts before it) to this day', () => {
    const over = timelineBand(dayStart, at(22), at(2, 0, 1));
    expect(over.left).toBeCloseTo(22 / 24);
    expect(over.left + over.width).toBeCloseTo(1);
    const before = timelineBand(dayStart, at(22, 0, -1), at(1));
    expect(before).toEqual({ left: 0, width: expect.closeTo(1 / 24) });
  });

  it('never returns a negative width for end < start', () => {
    expect(timelineBand(dayStart, at(10), at(9)).width).toBe(0);
  });
});

describe('buildDayShareModel', () => {
  const folders = [
    { id: 'a', name: '英語' },
    { id: 'b', name: '数学' },
  ];

  it('builds title, total, count, folder rows by time (desc) and timeline bands', () => {
    const m = buildDayShareModel({
      dayStart,
      folders,
      sessions: [
        session('b', at(13), at(13, 30)),
        session('a', at(9), at(10, 15)),
        session(null, at(20), at(20, 10)),
      ],
    });
    expect(m.appName).toBe('つみノート');
    expect(m.titleLabel).toBe('11月5日（木）の学習記録');
    expect(m.totalLabel).toBe('1時間55分');
    expect(m.sessionCountLabel).toBe('3セッション');
    expect(m.folderRows.map((r) => [r.name, r.durationLabel])).toEqual([
      ['英語', '1時間15分'],
      ['数学', '30分'],
      ['未分類', '10分'],
    ]);
    // Bands are chronological and carry the folder id (colors resolve in the view).
    expect(m.bands.map((b) => b.folderId)).toEqual(['a', 'b', null]);
    expect(m.bands[0]?.left).toBeCloseTo(9 / 24);
  });

  it('floors minutes after summing seconds (not per session)', () => {
    const m = buildDayShareModel({
      dayStart,
      folders,
      sessions: [session('a', at(9), at(9, 1), 59), session('a', at(10), at(10, 1), 59)],
    });
    // 59 + 59 = 118 s → 1 min (per-session flooring would give 0).
    expect(m.totalLabel).toBe('1分');
    expect(m.folderRows[0]?.durationLabel).toBe('1分');
  });

  it('keeps the top rows and merges the rest into その他', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: `F${i}` }));
    const m = buildDayShareModel({
      dayStart,
      folders: many,
      sessions: many.map((f, i) => session(f.id, at(8 + i), at(8 + i, 20), (10 - i) * 60)),
    });
    expect(m.folderRows).toHaveLength(MAX_SHARE_FOLDER_ROWS + 1);
    expect(m.folderRows.at(-1)).toMatchObject({ isOther: true, name: 'その他', durationLabel: '11分' });
    expect(m.bands).toHaveLength(6);
  });

  it('names a removed folder safely and supports custom color ids as plain folders', () => {
    const m = buildDayShareModel({
      dayStart,
      folders: [{ id: 'c', name: 'カスタム' }],
      sessions: [session('c', at(9), at(10)), session('gone', at(11), at(11, 30))],
    });
    expect(m.folderRows.map((r) => r.name)).toEqual(['カスタム', '不明なフォルダ']);
  });

  it('handles a day without sessions', () => {
    const m = buildDayShareModel({ dayStart, folders, sessions: [] });
    expect(m.totalLabel).toBe('0分');
    expect(m.sessionCountLabel).toBe('0セッション');
    expect(m.folderRows).toEqual([]);
    expect(m.bands).toEqual([]);
  });

  it('exposes only times and folder names (no notes or ids beyond folderId)', () => {
    const m = buildDayShareModel({ dayStart, folders, sessions: [session('a', at(9), at(10))] });
    expect(Object.keys(m).sort()).toEqual(
      [
        'appName',
        'bands',
        'dateLabel',
        'folderRows',
        'sessionCountLabel',
        'titleLabel',
        'totalLabel',
        'totalSeconds',
      ].sort(),
    );
  });
});
