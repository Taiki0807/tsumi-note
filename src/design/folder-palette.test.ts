import {
  FOLDER_COLOR_KEYS,
  FOLDER_PALETTE,
  contrastRatio,
  normalizeHexColor,
  folderColorLabel,
  folderColorSymbol,
  folderTone,
  isFolderColorKey,
  nextFolderColorKey,
  resolveFolderColorKey,
} from './folder-palette';
import { darkColors, lightColors } from './tokens';

describe('folder palette', () => {
  it('keeps the three original colors first and adds more', () => {
    expect(FOLDER_COLOR_KEYS.slice(0, 3)).toEqual(['primary', 'warning', 'info']);
    expect(FOLDER_COLOR_KEYS.length).toBeGreaterThan(3);
    expect(new Set(FOLDER_COLOR_KEYS).size).toBe(FOLDER_COLOR_KEYS.length);
  });

  it('gives every color a distinct symbol and name (not color-only)', () => {
    expect(new Set(FOLDER_PALETTE.map((p) => p.symbol)).size).toBe(FOLDER_PALETTE.length);
    expect(new Set(FOLDER_PALETTE.map((p) => p.label)).size).toBe(FOLDER_PALETTE.length);
  });

  it('defines distinct solid colors in both themes', () => {
    for (const [theme, isDark] of [
      [lightColors, false],
      [darkColors, true],
    ] as const) {
      const solids = FOLDER_COLOR_KEYS.map((k) => folderTone(k, theme, isDark).icon);
      expect(new Set(solids).size).toBe(solids.length);
    }
  });

  it('original colors come from the theme tokens (existing look is unchanged)', () => {
    expect(folderTone('warning', lightColors, false)).toEqual({
      tile: lightColors.warningSoft,
      icon: lightColors.warning,
      label: lightColors.warningText,
    });
    expect(folderTone('primary', darkColors, true).icon).toBe(darkColors.primary);
  });

  it('resolves a saved key, else falls back to the legacy creation-order cycle', () => {
    expect(resolveFolderColorKey('rose', 0)).toBe('rose');
    expect(resolveFolderColorKey(null, 0)).toBe('primary');
    expect(resolveFolderColorKey(undefined, 1)).toBe('warning');
    expect(resolveFolderColorKey('not-a-color', 5)).toBe('info');
    expect(isFolderColorKey('teal')).toBe(true);
    expect(isFolderColorKey('#ff0000')).toBe(false);
  });

  it('exposes the name and symbol shown next to the picker', () => {
    expect(FOLDER_PALETTE).toHaveLength(10);
    expect(folderColorLabel('teal')).toBe('ティール');
    expect(folderColorSymbol('teal')).toBe('◆');
  });

  it('picks the first unused color for a new folder', () => {
    expect(nextFolderColorKey([])).toBe('primary');
    expect(nextFolderColorKey(['primary', 'warning'])).toBe('info');
    expect(nextFolderColorKey(['primary', null, 'zzz'])).toBe('warning');
    const all = [...FOLDER_COLOR_KEYS];
    expect(FOLDER_COLOR_KEYS).toContain(nextFolderColorKey(all));
  });
});

describe('custom folder color', () => {
  it('normalizes hex to upper-case #RRGGBB and rejects the rest', () => {
    expect(normalizeHexColor('#aabbcc')).toBe('#AABBCC');
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor(' #A1B2C3 ')).toBe('#A1B2C3');
    for (const bad of ['#aabbccdd', '#abcd', 'aabbcc', '#ggg', '#12345', '', 'rose', null, undefined, 5]) {
      expect(normalizeHexColor(bad)).toBeNull();
    }
  });

  it('resolveFolderColorKey handles keys, hex, invalid values and null', () => {
    expect(resolveFolderColorKey('teal', 0)).toBe('teal');
    expect(resolveFolderColorKey('#abc', 0)).toBe('#AABBCC');
    expect(resolveFolderColorKey('#aabbccdd', 1)).toBe('warning');
    expect(resolveFolderColorKey('unknown', 2)).toBe('info');
    expect(resolveFolderColorKey(null, 0)).toBe('primary');
  });

  it('uses the custom label and symbol', () => {
    expect(folderColorLabel('#112233')).toBe('カスタム');
    expect(folderColorSymbol('#112233')).toBe('✦');
    expect(FOLDER_PALETTE.map((p) => p.symbol)).not.toContain('✦');
  });

  it('keeps label ≥ 4.5:1 on the tile and the dark icon ≥ 3:1 for any color', () => {
    const samples = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#808080', '#0A0A2A', '#FFF8E0', '#7C5CFC'] as const;
    for (const hex of samples) {
      for (const [theme, isDark] of [
        [lightColors, false],
        [darkColors, true],
      ] as const) {
        const tone = folderTone(hex, theme, isDark);
        expect(contrastRatio(tone.label, tone.tile)).toBeGreaterThanOrEqual(4.5);
        if (isDark) expect(contrastRatio(tone.icon, theme.background)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps an already bright color unchanged and lightens a dark one in dark mode', () => {
    expect(folderTone('#FACC15', darkColors, true).icon).toBe('#facc15');
    expect(folderTone('#000000', darkColors, true).icon).not.toBe('#000000');
    expect(folderTone('#FF0000', lightColors, false).icon).toBe('#ff0000');
  });

  it('does not change palette colors', () => {
    expect(folderTone('teal', lightColors, false)).toEqual({ tile: '#e0f5f2', icon: '#0d9488', label: '#0b6b62' });
  });
});
