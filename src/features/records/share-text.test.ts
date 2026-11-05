import type { DayShareModel, ShareFolderRow, ShareModel } from './share-model';
import {
  buildDayShareText,
  buildWeekShareText,
  DAY_SHARE_HASHTAGS,
  SHARE_TEXT_MAX_WEIGHT,
  truncateToWeight,
  WEEK_SHARE_HASHTAGS,
  weightedLength,
} from './share-text';

const row = (name: string, durationLabel: string, isOther = false): ShareFolderRow => ({
  folderId: isOther ? null : name,
  isOther,
  name,
  seconds: 0,
  durationLabel,
});

const week = (folderRows: ShareFolderRow[], totalLabel = '12時間30分'): ShareModel => ({
  appName: 'つみノート',
  periodLabel: '10/27（月） – 11/2（日）',
  scopeLabel: 'すべて',
  totalSeconds: 0,
  totalLabel,
  diffLabel: null,
  folderRows,
  bars: [],
  maxHours: 1,
});

const day = (folderRows: ShareFolderRow[]): DayShareModel => ({
  appName: 'つみノート',
  dateLabel: '11月5日（水）',
  titleLabel: '11月5日（水）の学習記録',
  totalSeconds: 0,
  totalLabel: '2時間15分',
  sessionCountLabel: '4セッション',
  folderRows,
  bands: [],
});

const THREE = [row('英語', '5時間10分'), row('数学', '4時間'), row('プログラミング', '3時間20分')];

describe('weightedLength / truncateToWeight', () => {
  it('counts half-width as 1 and full-width / emoji as 2', () => {
    expect(weightedLength('abc #1')).toBe(6);
    expect(weightedLength('学習')).toBe(4);
    expect(weightedLength('📚')).toBe(2);
  });

  it('truncates with an ellipsis within the weight', () => {
    expect(truncateToWeight('abc', 5)).toBe('abc');
    expect(truncateToWeight('あいうえお', 6)).toBe('あい…');
    expect(weightedLength(truncateToWeight('あいうえお', 6))).toBeLessThanOrEqual(6);
    expect(truncateToWeight('あいうえお', 1)).toBe('');
  });
});

describe('buildWeekShareText', () => {
  it('current week: headline, top-3 breakdown, hashtags', () => {
    expect(buildWeekShareText(week(THREE))).toBe(
      `今週の学習時間は12時間30分でした📚\n英語 5時間10分 / 数学 4時間 / プログラミング 3時間20分\n${WEEK_SHARE_HASHTAGS}`,
    );
  });

  it('fixes the hashtags', () => {
    expect(WEEK_SHARE_HASHTAGS).toBe('#つみノート #勉強記録 #積み上げ');
  });

  it('past week: the period replaces 今週', () => {
    const text = buildWeekShareText(week(THREE), { isCurrentWeek: false });
    expect(text.split('\n')[0]).toBe('10/27（月） – 11/2（日）の学習時間は12時間30分でした📚');
  });

  it('folder filter: name in the headline, no breakdown', () => {
    const text = buildWeekShareText(week(THREE), { folderName: '英語' });
    expect(text).toBe(`今週の英語の学習時間は12時間30分でした📚\n${WEEK_SHARE_HASHTAGS}`);
    expect(buildWeekShareText(week(THREE), { folderName: '英語', isCurrentWeek: false }).split('\n')[0]).toBe(
      '10/27（月） – 11/2（日）の英語の学習時間は12時間30分でした📚',
    );
  });

  it('0 / 1 rows; 4+ rows keep the top 3 and skip the merged その他', () => {
    expect(buildWeekShareText(week([], '0分')).split('\n')).toEqual([
      '今週の学習時間は0分でした📚',
      WEEK_SHARE_HASHTAGS,
    ]);
    expect(buildWeekShareText(week([row('未分類', '45分')])).split('\n')[1]).toBe('未分類 45分');
    const many = [...THREE, row('国語', '1時間'), row('その他', '30分', true)];
    expect(buildWeekShareText(week(many)).split('\n')[1]).toBe(
      '英語 5時間10分 / 数学 4時間 / プログラミング 3時間20分',
    );
  });

  it('uses the labels of the model as they are (same values as the image)', () => {
    expect(buildWeekShareText(week([row('英語', '59分')], '59分'))).toContain('59分でした');
  });

  it('stays within 280 and keeps total + hashtags with long names', () => {
    const long = 'あ'.repeat(150);
    const text = buildWeekShareText(week([row(long, '1時間'), row(long, '1時間'), row(long, '1時間')]));
    expect(weightedLength(text)).toBeLessThanOrEqual(SHARE_TEXT_MAX_WEIGHT);
    expect(text).toContain('12時間30分');
    expect(text.endsWith(WEEK_SHARE_HASHTAGS)).toBe(true);
    expect(text).toContain('…');
  });

  it('drops rows before shortening names', () => {
    const mid = 'あ'.repeat(45);
    const text = buildWeekShareText(week([row(mid, '1時間'), row(mid, '1時間'), row(mid, '1時間')]));
    expect(weightedLength(text)).toBeLessThanOrEqual(SHARE_TEXT_MAX_WEIGHT);
    expect(text).not.toContain('…');
    expect(text.split('\n')[1]).toBe(`${mid} 1時間 / ${mid} 1時間`);
  });

  it('shortens a very long filtered folder name', () => {
    const text = buildWeekShareText(week([]), { folderName: 'い'.repeat(300) });
    expect(weightedLength(text)).toBeLessThanOrEqual(SHARE_TEXT_MAX_WEIGHT);
    expect(text).toContain('…');
    expect(text).toContain('12時間30分');
    expect(text.endsWith(WEEK_SHARE_HASHTAGS)).toBe(true);
  });
});

describe('buildDayShareText', () => {
  it('headline with date, total, session count; breakdown; hashtags', () => {
    expect(buildDayShareText(day([row('英語', '1時間30分'), row('数学', '45分')]))).toBe(
      `11月5日（水）の学習時間は2時間15分でした📚(4セッション)\n英語 1時間30分 / 数学 45分\n${DAY_SHARE_HASHTAGS}`,
    );
    expect(DAY_SHARE_HASHTAGS).toBe('#つみノート #勉強記録 #今日の積み上げ');
  });

  it('0 rows omits the breakdown; 未分類 is shown; top 3 only', () => {
    expect(buildDayShareText(day([])).split('\n')).toHaveLength(2);
    expect(buildDayShareText(day([row('未分類', '10分')])).split('\n')[1]).toBe('未分類 10分');
    const many = [...THREE, row('国語', '1時間')];
    expect(buildDayShareText(day(many)).split('\n')[1]).not.toContain('国語');
  });

  it('stays within 280 with long names', () => {
    const long = 'ア'.repeat(80);
    const text = buildDayShareText(day([row(long, '1時間'), row(long, '1時間'), row(long, '1時間')]));
    expect(weightedLength(text)).toBeLessThanOrEqual(SHARE_TEXT_MAX_WEIGHT);
    expect(text).toContain('2時間15分');
    expect(text.endsWith(DAY_SHARE_HASHTAGS)).toBe(true);
  });
});
