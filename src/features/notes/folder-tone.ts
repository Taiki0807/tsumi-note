import { folderTone, resolveFolderColorKey, useTheme, useThemeName } from '@/design';

/**
 * Per-folder tone (Figma 03 / 04). A folder uses its saved palette color (`folders.color`); one without
 * (synced from an older app version) falls back to the legacy creation-order cycle primary → warning →
 * info. The folder-less 共通 / 未分類 row (index < 0) uses the success tone.
 */
export function useFolderTone(folderIndex: number, color?: string | null) {
  const c = useTheme();
  const isDark = useThemeName() === 'dark';
  if (folderIndex < 0) return { tile: c.successSoft, icon: c.success, label: c.successText };
  return folderTone(resolveFolderColorKey(color, folderIndex), c, isDark);
}
