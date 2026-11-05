import { folderTone, resolveFolderColorKey, useTheme, useThemeName } from '@/design';

import { folderColorIndex } from './records-logic';

/**
 * Folder → chart color: the folder's saved palette color, else the legacy primary → warning → info cycle
 * in folder-list order. 未分類 is success.
 */
export function useFolderColors(folders: { id: string; color?: string | null }[]) {
  const colors = useTheme();
  const isDark = useThemeName() === 'dark';
  const order = folders.map((f) => f.id);
  return (folderId: string | null) => {
    const index = folderColorIndex(order, folderId);
    if (index < 0) return colors.success;
    return folderTone(resolveFolderColorKey(folders[index]?.color, index), colors, isDark).icon;
  };
}
