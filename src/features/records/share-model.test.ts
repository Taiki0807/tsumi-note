import { buildWeeklyRecord } from './records-logic';
import { buildShareModel, formatDuration, MAX_SHARE_FOLDER_ROWS } from './share-model';

const weekStart = new Date(2026, 8, 7).getTime(); // Mon 9/7
const at = (dayOffset: number, hour = 10) => new Date(2026, 8, 7 + dayOffset, hour).getTime();

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(0)).toBe('0分');
    expect(formatDuration(45 * 60 + 59)).toBe('45分');
    expect(formatDuration(3600)).toBe('1時間');
    expect(formatDuration(5400)).toBe('1時間30分');
  });
});

describe('buildShareModel', () => {
  const folders = [
    { id: 'a', name: '英語' },
    { id: 'b', name: '数学' },
  ];

  it('reflects period, total, folder totals and bars', () => {
    const record = buildWeeklyRecord(
      [
        { folderId: 'a', startedAt: at(0), durationSeconds: 3600 },
        { folderId: 'b', startedAt: at(0, 12), durationSeconds: 1800 },
        { folderId: null, startedAt: at(2), durationSeconds: 600 },
        { folderId: 'a', startedAt: at(-3), durationSeconds: 3600 },
      ],
      weekStart,
      undefined,
      ['a', 'b'],
    );
    const m = buildShareModel({ record, folders });
    expect(m.appName).toBe('つみノート');
    expect(m.periodLabel).toBe('9/7（月） – 9/13（日）');
    expect(m.scopeLabel).toBe('すべて');
    expect(m.totalLabel).toBe('1時間40分');
    expect(m.folderRows.map((r) => [r.name, r.durationLabel])).toEqual([
      ['英語', '1時間'],
      ['数学', '30分'],
      ['未分類', '10分'],
    ]);
    expect(m.bars).toHaveLength(7);
    expect(m.bars[0]).toMatchObject({ weekday: '月', label: '90分' });
    expect(m.bars[0]?.segments.reduce((s, x) => s + x.ratio, 0)).toBeCloseTo(1);
    expect(m.bars[1]).toMatchObject({ ratio: 0, label: null });
    expect(m.maxHours).toBe(2);
    expect(m.diffLabel).toContain('前週比');
  });

  it('uses the selected folder name as scope', () => {
    const record = buildWeeklyRecord(
      [{ folderId: 'b', startedAt: at(1), durationSeconds: 600 }],
      weekStart,
      'b',
      ['a', 'b'],
    );
    expect(buildShareModel({ record, folders, folderId: 'b' }).scopeLabel).toBe('数学');
  });

  it('merges overflow folders into その他 and handles empty weeks', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: `F${i}` }));
    const record = buildWeeklyRecord(
      many.map((f, i) => ({ folderId: f.id, startedAt: at(0), durationSeconds: (10 - i) * 60 })),
      weekStart,
      undefined,
      many.map((f) => f.id),
    );
    const m = buildShareModel({ record, folders: many });
    expect(m.folderRows).toHaveLength(MAX_SHARE_FOLDER_ROWS + 1);
    expect(m.folderRows.at(-1)).toMatchObject({ isOther: true, name: 'その他', durationLabel: '11分' });

    const empty = buildShareModel({ record: buildWeeklyRecord([], weekStart), folders });
    expect(empty.folderRows).toEqual([]);
    expect(empty.totalLabel).toBe('0分');
    expect(empty.diffLabel).toBeNull();
  });
});
