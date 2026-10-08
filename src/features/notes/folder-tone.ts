import { useTheme } from '@/design';

/**
 * Figma 03 / 04: per-folder colors — 韓国語 primary, 簿記 warning, and the folder-less 共通 row success.
 * Folders cycle primary → warning → info (the same order as the folder list tiles); 未分類 (index < 0)
 * uses the success tone.
 */
export function useFolderTone(folderIndex: number) {
  const c = useTheme();
  const variants = [
    { tile: c.primarySoft, icon: c.primary, label: c.primary },
    { tile: c.warningSoft, icon: c.warning, label: c.warningText },
    { tile: c.infoSoft, icon: c.info, label: c.infoText },
  ] as const;
  if (folderIndex < 0) return { tile: c.successSoft, icon: c.success, label: c.successText };
  return variants[folderIndex % 3] ?? variants[0];
}
