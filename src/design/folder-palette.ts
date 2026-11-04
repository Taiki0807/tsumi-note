import type { ThemeColors } from './tokens';

/**
 * Folder color palette (single source of truth for the folder list tile, notes, the folder picker and
 * the records chart). The stored value is the `key` (`folders.color`), never a hex code, so a palette
 * can be re-tuned without a data migration.
 *
 * - The first three keys keep the original Figma variants (primary / warning / info) and read their
 *   values from the theme tokens, so existing folders look exactly as before.
 * - Every color has a distinct `symbol` (shown in the picker and next to the name) so the choice never
 *   relies on hue alone (color-vision accessibility).
 * - New colors define explicit light / dark values: `solid` (chart / icon), `soft` (tile background) and
 *   `text` (label on `soft`, contrast ≥ 4.5:1 in both themes).
 */
export type FolderColorKey =
  'primary' | 'warning' | 'info' | 'teal' | 'lime' | 'yellow' | 'rose' | 'pink' | 'brown' | 'slate';

export type FolderTone = {
  /** Tinted tile background. */
  tile: string;
  /** Icon / chart color. */
  icon: string;
  /** Text color on the tile. */
  label: string;
};

type Variant = { solid: string; soft: string; text: string };

type PaletteEntry = {
  key: FolderColorKey;
  /** Japanese name (picker label / accessibility). */
  label: string;
  /** Non-color cue shown with the swatch. */
  symbol: string;
  /** `null` = read from the theme tokens (the original three). */
  light: Variant | null;
  dark: Variant | null;
};

export const FOLDER_PALETTE: readonly PaletteEntry[] = [
  { key: 'primary', label: 'パープル', symbol: '●', light: null, dark: null },
  { key: 'warning', label: 'オレンジ', symbol: '■', light: null, dark: null },
  { key: 'info', label: 'ブルー', symbol: '▲', light: null, dark: null },
  {
    key: 'teal',
    label: 'ティール',
    symbol: '◆',
    light: { solid: '#0d9488', soft: '#e0f5f2', text: '#0b6b62' },
    dark: { solid: '#2dd4bf', soft: '#17332f', text: '#5eead4' },
  },
  {
    key: 'lime',
    label: 'ライム',
    symbol: '★',
    light: { solid: '#65a30d', soft: '#eef7dc', text: '#456f09' },
    dark: { solid: '#a3e635', soft: '#2a3314', text: '#bef264' },
  },
  {
    key: 'yellow',
    label: 'イエロー',
    symbol: '✚',
    light: { solid: '#eab308', soft: '#fdf6d3', text: '#7a5c00' },
    dark: { solid: '#facc15', soft: '#37300f', text: '#fde047' },
  },
  {
    key: 'rose',
    label: 'レッド',
    symbol: '✖',
    light: { solid: '#e11d48', soft: '#ffe4ea', text: '#a3122f' },
    dark: { solid: '#fb7185', soft: '#3d1f27', text: '#fda4af' },
  },
  {
    key: 'pink',
    label: 'ピンク',
    symbol: '♥',
    light: { solid: '#d946ef', soft: '#fae8ff', text: '#9a1fb0' },
    dark: { solid: '#e879f9', soft: '#3a1f40', text: '#f0abfc' },
  },
  {
    key: 'brown',
    label: 'ブラウン',
    symbol: '⬟',
    light: { solid: '#92400e', soft: '#f6e9df', text: '#7a3409' },
    dark: { solid: '#d6985f', soft: '#33271c', text: '#e8b88a' },
  },
  {
    key: 'slate',
    label: 'グレー',
    symbol: '⬢',
    light: { solid: '#64748b', soft: '#e8ecf1', text: '#475569' },
    dark: { solid: '#94a3b8', soft: '#2a2f36', text: '#cbd5e1' },
  },
];

export const FOLDER_COLOR_KEYS: readonly FolderColorKey[] = FOLDER_PALETTE.map((p) => p.key);

export function isFolderColorKey(value: unknown): value is FolderColorKey {
  return typeof value === 'string' && FOLDER_COLOR_KEYS.includes(value as FolderColorKey);
}

/** The legacy automatic colors: folders cycled primary → warning → info in creation order. */
const LEGACY_CYCLE: readonly FolderColorKey[] = ['primary', 'warning', 'info'];

/** The color key to use: the saved one, else the legacy creation-order cycle (`index` < 0 → none). */
export function resolveFolderColorKey(color: string | null | undefined, index: number): FolderColorKey {
  if (isFolderColorKey(color)) return color;
  return LEGACY_CYCLE[Math.max(index, 0) % LEGACY_CYCLE.length] ?? 'primary';
}

/** The key assigned to the next new folder: the first palette color not used by a live folder (cycling afterwards). */
export function nextFolderColorKey(usedColors: readonly (string | null | undefined)[]): FolderColorKey {
  const used = new Set(usedColors.filter(isFolderColorKey));
  return (
    FOLDER_COLOR_KEYS.find((k) => !used.has(k)) ??
    FOLDER_COLOR_KEYS[usedColors.length % FOLDER_COLOR_KEYS.length] ??
    'primary'
  );
}

export function folderColorLabel(key: FolderColorKey): string {
  return FOLDER_PALETTE.find((p) => p.key === key)?.label ?? key;
}

export function folderColorSymbol(key: FolderColorKey): string {
  return FOLDER_PALETTE.find((p) => p.key === key)?.symbol ?? '●';
}

/** Tone of a palette color in the given theme. */
export function folderTone(key: FolderColorKey, theme: ThemeColors, isDark: boolean): FolderTone {
  const entry = FOLDER_PALETTE.find((p) => p.key === key);
  const variant = isDark ? entry?.dark : entry?.light;
  if (variant) return { tile: variant.soft, icon: variant.solid, label: variant.text };
  switch (key) {
    case 'warning':
      return { tile: theme.warningSoft, icon: theme.warning, label: theme.warningText };
    case 'info':
      return { tile: theme.infoSoft, icon: theme.info, label: theme.infoText };
    default:
      return { tile: theme.primarySoft, icon: theme.primary, label: theme.primary };
  }
}
