import { render, screen } from '@testing-library/react-native';

import { DayShareImageView, ShareImageView } from './share-image-view';
import type { DayShareModel, ShareModel } from './share-model';

// The capture view is hidden from accessibility on purpose, so queries must include hidden elements.
const text = (t: string) => screen.queryByText(t, { includeHiddenElements: true });
const colorFor = () => '#6949ff';

const row = (name: string, seconds: number, durationLabel: string) => ({
  folderId: name,
  isOther: false,
  name,
  seconds,
  durationLabel,
});

const week: ShareModel = {
  appName: 'つみノート',
  periodLabel: '10/27（月） – 11/2（日）',
  scopeLabel: 'すべて',
  totalSeconds: 9 * 3600 + 40 * 60,
  totalLabel: '9時間40分',
  diffLabel: null,
  folderRows: [row('韓国語', 15000, '4時間10分')],
  bars: ['月', '火', '水', '木', '金', '土', '日'].map((weekday) => ({
    weekday,
    seconds: 3600,
    ratio: 0.5,
    label: '1h',
    segments: [{ folderId: 'a', ratio: 1 }],
  })),
  maxHours: 2,
};

const day: DayShareModel = {
  appName: 'つみノート',
  dateLabel: '11月5日（木）',
  titleLabel: '11月5日（木）の学習記録',
  totalSeconds: 8100,
  totalLabel: '2時間15分',
  sessionCountLabel: '5セッション',
  folderRows: [row('韓国語', 3600, '1時間'), row('簿記2級', 2700, '45分')],
  bands: [],
};

describe('share images (Figma 04 · App Store)', () => {
  it('weekly: pill, 1日平均 chip (floored), total, weekdays, rows and hashtag', async () => {
    await render(<ShareImageView model={week} colorFor={colorFor} />);
    expect(text('10/27（月） – 11/2（日）')).toBeTruthy();
    expect(text('今週の学習時間')).toBeTruthy();
    // 580 min / 7 = 82.86 → 1時間22分 (floored like every other duration)
    expect(text('1日平均 1時間22分')).toBeTruthy();
    expect(text('9')).toBeTruthy();
    expect(text('40')).toBeTruthy();
    expect(text('日')).toBeTruthy();
    expect(text('4時間10分')).toBeTruthy();
    expect(text('#今週の積み上げ')).toBeTruthy();
    expect(text('つみノートで記録中')).toBeTruthy();
  });

  it('weekly with a folder filter names the folder in the label', async () => {
    await render(<ShareImageView model={{ ...week, scopeLabel: '英語' }} colorFor={colorFor} />);
    expect(text('英語の学習時間')).toBeTruthy();
  });

  it('weekly without records shows the empty message', async () => {
    await render(<ShareImageView model={{ ...week, folderRows: [], totalSeconds: 0, totalLabel: '0分' }} colorFor={colorFor} />);
    expect(text('この週の学習記録はまだありません')).toBeTruthy();
  });

  it('daily: date pill, total, rows, session chip and hashtag', async () => {
    await render(<DayShareImageView model={day} colorFor={colorFor} />);
    expect(text('11月5日（木）')).toBeTruthy();
    expect(text('今日の学習時間')).toBeTruthy();
    expect(text('2')).toBeTruthy();
    expect(text('15')).toBeTruthy();
    expect(text('簿記2級')).toBeTruthy();
    expect(text('45分')).toBeTruthy();
    expect(text('5セッション')).toBeTruthy();
    expect(text('#今日の積み上げ')).toBeTruthy();
  });

  it('daily without records shows the empty message', async () => {
    await render(<DayShareImageView model={{ ...day, folderRows: [], totalSeconds: 0, totalLabel: '0分' }} colorFor={colorFor} />);
    expect(text('この日の学習記録はまだありません')).toBeTruthy();
  });
});
