import {
  FOLDER_COLOR_KEYS,
  FOLDER_PALETTE,
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

  it('picks the first unused color for a new folder', () => {
    expect(nextFolderColorKey([])).toBe('primary');
    expect(nextFolderColorKey(['primary', 'warning'])).toBe('info');
    expect(nextFolderColorKey(['primary', null, 'zzz'])).toBe('warning');
    const all = [...FOLDER_COLOR_KEYS];
    expect(FOLDER_COLOR_KEYS).toContain(nextFolderColorKey(all));
  });
});
