import {
  chartMaxHours,
  formatDayLabel,
  formatDiff,
  formatWeekRange,
  WEEKDAY_LABELS,
  type WeeklyRecord,
} from './records-logic';

/** Output image: 1080x1350 px (4:5, SNS friendly). The view is laid out in 360x450 pt and captured at 3x. */
export const SHARE_IMAGE = {
  pixelWidth: 1080,
  pixelHeight: 1350,
  width: 360,
  height: 450,
} as const;

/** Folder rows shown in the image; the rest is merged into 「その他」 so the layout never overflows. */
export const MAX_SHARE_FOLDER_ROWS = 4;

export type ShareFolderRow = {
  /** null = 未分類. Ignored for the merged row (`isOther`). */
  folderId: string | null;
  isOther: boolean;
  name: string;
  seconds: number;
  /** "1時間30分" style. */
  durationLabel: string;
};

export type ShareBar = {
  weekday: string;
  seconds: number;
  /** 0..1 against the chart maximum. */
  ratio: number;
  label: string | null;
  /** Share of the day's bar per folder (sums to 1 when the day has records). */
  segments: { folderId: string | null; ratio: number }[];
};

export type ShareModel = {
  appName: string;
  periodLabel: string;
  /** "すべて" or the selected folder's name. */
  scopeLabel: string;
  totalSeconds: number;
  totalLabel: string;
  diffLabel: string | null;
  folderRows: ShareFolderRow[];
  bars: ShareBar[];
  maxHours: number;
};

/** "1時間30分" / "45分" / "0分" (minutes rounded down, like the weekly total). */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/**
 * Pure mapping from the weekly record currently shown on screen to the share image content.
 * `folders` is the folder list used for names; `folderId` is the active filter (undefined = すべて).
 */
export function buildShareModel(input: {
  record: WeeklyRecord;
  folders: { id: string; name: string }[];
  folderId?: string;
}): ShareModel {
  const { record, folders, folderId } = input;
  const nameOf = (id: string | null) =>
    id === null ? '未分類' : (folders.find((f) => f.id === id)?.name ?? '不明なフォルダ');

  const totals = new Map<string | null, number>();
  for (const day of record.days) {
    for (const s of day.segments) totals.set(s.folderId, (totals.get(s.folderId) ?? 0) + s.seconds);
  }
  const sorted = [...totals.entries()]
    .filter(([, seconds]) => seconds > 0)
    .sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0])));
  const folderRows: ShareFolderRow[] = sorted.slice(0, MAX_SHARE_FOLDER_ROWS).map(([id, seconds]) => ({
    folderId: id,
    isOther: false,
    name: nameOf(id),
    seconds,
    durationLabel: formatDuration(seconds),
  }));
  const rest = sorted.slice(MAX_SHARE_FOLDER_ROWS);
  if (rest.length > 0) {
    const seconds = rest.reduce((sum, [, s]) => sum + s, 0);
    folderRows.push({
      folderId: null,
      isOther: true,
      name: 'その他',
      seconds,
      durationLabel: formatDuration(seconds),
    });
  }

  const maxHours = chartMaxHours(record.days);
  const bars: ShareBar[] = record.days.map((day) => ({
    weekday: WEEKDAY_LABELS[day.weekdayIndex] ?? '',
    seconds: day.seconds,
    ratio: Math.min(1, day.seconds / 3600 / maxHours),
    label: formatDayLabel(day.seconds),
    segments: day.segments.map((s) => ({
      folderId: s.folderId,
      ratio: day.seconds > 0 ? s.seconds / day.seconds : 0,
    })),
  }));

  const hasData = record.totalSeconds > 0 || record.previousTotalSeconds > 0;
  return {
    appName: 'つみノート',
    periodLabel: formatWeekRange(record.weekStart),
    scopeLabel: folderId === undefined ? 'すべて' : nameOf(folderId),
    totalSeconds: record.totalSeconds,
    totalLabel: formatDuration(record.totalSeconds),
    diffLabel: hasData ? formatDiff(record.diffSeconds).label : null,
    folderRows,
    bars,
    maxHours,
  };
}
