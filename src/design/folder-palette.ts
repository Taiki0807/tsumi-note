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

/** A free color chosen with the color picker: always `#RRGGBB` (upper case, no alpha). */
export type CustomFolderColor = `#${string}`;

/** What `folders.color` can hold: a palette key or a custom hex. */
export type FolderColorValue = FolderColorKey | CustomFolderColor;

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

/** `#RGB` / `#RRGGBB` (any case) → `#RRGGBB` upper case. Alpha forms (`#RGBA`, `#RRGGBBAA`) and anything else → `null`. */
export function normalizeHexColor(value: unknown): CustomFolderColor | null {
  if (typeof value !== 'string') return null;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (!m?.[1]) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${hex.toUpperCase()}`;
}

/** Palette key or valid hex (normalized); anything else → `null`. */
export function parseFolderColor(value: unknown): FolderColorValue | null {
  return isFolderColorKey(value) ? value : normalizeHexColor(value);
}

/** The color to use: the saved key / hex, else the legacy creation-order cycle (`index` < 0 → none). */
export function resolveFolderColorKey(color: string | null | undefined, index: number): FolderColorValue {
  const parsed = parseFolderColor(color);
  if (parsed) return parsed;
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

export const CUSTOM_COLOR_LABEL = 'カスタム';
export const CUSTOM_COLOR_SYMBOL = '✦';

export function folderColorLabel(key: FolderColorValue): string {
  if (normalizeHexColor(key)) return CUSTOM_COLOR_LABEL;
  return FOLDER_PALETTE.find((p) => p.key === key)?.label ?? key;
}

export function folderColorSymbol(key: FolderColorValue): string {
  if (normalizeHexColor(key)) return CUSTOM_COLOR_SYMBOL;
  return FOLDER_PALETTE.find((p) => p.key === key)?.symbol ?? '●';
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255] as Rgb;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rr) h = ((gg - bb) / d) % 6;
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b]: Rgb =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#RRGGBB` colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: string, b: string, weightOfA: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex(ra.map((v, i) => v * weightOfA + (rb[i] as number) * (1 - weightOfA)) as Rgb);
}

/** Moves the lightness of `hex` in `direction` in small steps until it reaches `min` contrast against `against`. */
function adjustLightness(hex: string, against: string, min: number, direction: 1 | -1): string {
  if (contrastRatio(hex, against) >= min) return hex;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  for (let step = 1; step <= 50; step++) {
    const candidate = rgbToHex(hslToRgb([h, s, Math.min(1, Math.max(0, l + direction * step * 0.02))]));
    if (contrastRatio(candidate, against) >= min) return candidate;
  }
  return direction === 1 ? '#ffffff' : '#000000';
}

/**
 * Tone of a free color (`#RRGGBB`) in the given theme. Pure.
 * - icon: the color itself; in dark it is lightened until it has ≥ 3:1 against the background.
 * - tile: the color mixed into the theme background (light 14 %, dark 22 %).
 * - label: the color's hue, darkened (light) / lightened (dark) until it has ≥ 4.5:1 against the tile.
 */
export function customFolderTone(hex: CustomFolderColor, theme: ThemeColors, isDark: boolean): FolderTone {
  const base = (normalizeHexColor(hex) ?? '#808080').toLowerCase();
  const bg = (normalizeHexColor(theme.background) ?? (isDark ? '#000000' : '#ffffff')).toLowerCase();
  const tile = mix(base, bg, isDark ? 0.22 : 0.14);
  const icon = isDark ? adjustLightness(base, bg, 3, 1) : base;
  const label = adjustLightness(isDark ? icon : base, tile, 4.5, isDark ? 1 : -1);
  return { tile, icon, label };
}

/** Tone of a palette color or custom hex in the given theme. */
export function folderTone(key: FolderColorValue, theme: ThemeColors, isDark: boolean): FolderTone {
  const custom = normalizeHexColor(key);
  if (custom) return customFolderTone(custom, theme, isDark);
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
