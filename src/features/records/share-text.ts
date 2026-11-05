import type { DayShareModel, ShareFolderRow, ShareModel } from './share-model';

/** Hashtags (separated by a half-width space, on their own last line so they are recognised as tags). */
export const WEEK_SHARE_HASHTAGS = '#つみノート #勉強記録 #積み上げ';
export const DAY_SHARE_HASHTAGS = '#つみノート #勉強記録 #今日の積み上げ';

/** X: 280 weighted characters (full-width = 2, half-width = 1). URLs are not included, so they are not counted. */
export const SHARE_TEXT_MAX_WEIGHT = 280;
/** Folder rows listed in the breakdown line. */
export const MAX_TEXT_FOLDER_ROWS = 3;

/** X's weighting (twitter-text v3): Latin / general punctuation ranges count 1, everything else (CJK, emoji) 2. */
export function weightedLength(text: string): number {
  let weight = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    const light =
      c <= 0x10ff ||
      (c >= 0x2000 && c <= 0x200d) ||
      (c >= 0x2010 && c <= 0x201f) ||
      (c >= 0x2032 && c <= 0x2037);
    weight += light ? 1 : 2;
  }
  return weight;
}

/** Longest prefix of `text` that, followed by 「…」, fits in `maxWeight` (`''` when even 「…」 does not fit). */
export function truncateToWeight(text: string, maxWeight: number): string {
  if (weightedLength(text) <= maxWeight) return text;
  let out = '';
  for (const ch of text) {
    if (weightedLength(`${out}${ch}…`) > maxWeight) break;
    out += ch;
  }
  return weightedLength(`${out}…`) <= maxWeight ? `${out}…` : '';
}

type Parts = {
  /** Builds the first line from the (possibly shortened) scope name; the total is never shortened. */
  headline: (scopeName: string | null) => string;
  scopeName: string | null;
  /** Breakdown candidates (longest first); the merged 「その他」 row is excluded. */
  rows: Pick<ShareFolderRow, 'name' | 'durationLabel' | 'isOther'>[];
  hashtags: string;
};

/**
 * Shared text assembly: headline, optional folder breakdown (top 3), hashtags. Over the limit it first drops
 * breakdown rows (3 → 1), then shortens folder names with 「…」; the total and hashtags always remain.
 */
function assemble({ headline, scopeName, rows, hashtags }: Parts): string {
  const top = rows.filter((r) => !r.isOther).slice(0, MAX_TEXT_FOLDER_ROWS);
  const compose = (scope: string | null, shown: { name: string; durationLabel: string }[]) =>
    [
      headline(scope),
      ...(shown.length > 0 ? [shown.map((r) => `${r.name} ${r.durationLabel}`).join(' / ')] : []),
      hashtags,
    ].join('\n');
  const fits = (text: string) => weightedLength(text) <= SHARE_TEXT_MAX_WEIGHT;

  for (let n = top.length; n >= 2; n--) {
    const text = compose(scopeName, top.slice(0, n));
    if (fits(text)) return text;
  }
  const first = top[0];
  if (first) {
    const text = compose(scopeName, [first]);
    if (fits(text)) return text;
    // One row left and still too long: shorten its name.
    const overflow = weightedLength(text) - SHARE_TEXT_MAX_WEIGHT;
    const name = truncateToWeight(first.name, Math.max(0, weightedLength(first.name) - overflow));
    if (name !== '') return compose(scopeName, [{ ...first, name }]);
  }
  const bare = compose(scopeName, []);
  if (fits(bare)) return bare;
  // Even the headline is too long (very long folder name in the filter): shorten that name.
  if (scopeName !== null) {
    const overflow = weightedLength(bare) - SHARE_TEXT_MAX_WEIGHT;
    return compose(truncateToWeight(scopeName, Math.max(0, weightedLength(scopeName) - overflow)), []);
  }
  return bare;
}

/**
 * Share text of the weekly record. `isCurrentWeek` false → the period replaces 「今週」; `folderName` set
 * (folder filter) → the name goes into the headline and the breakdown is left out.
 */
export function buildWeekShareText(
  model: ShareModel,
  options: { isCurrentWeek?: boolean; folderName?: string } = {},
): string {
  const { isCurrentWeek = true, folderName } = options;
  const period = isCurrentWeek ? '今週' : model.periodLabel;
  return assemble({
    headline: (scope) => `${period}${scope === null ? '' : `の${scope}`}の学習時間は${model.totalLabel}でした📚`,
    scopeName: folderName ?? null,
    rows: folderName === undefined ? model.folderRows : [],
    hashtags: WEEK_SHARE_HASHTAGS,
  });
}

/** Share text of one day. */
export function buildDayShareText(model: DayShareModel): string {
  return assemble({
    headline: () => `${model.dateLabel}の学習時間は${model.totalLabel}でした📚(${model.sessionCountLabel})`,
    scopeName: null,
    rows: model.folderRows,
    hashtags: DAY_SHARE_HASHTAGS,
  });
}
