import { useTheme } from '@/design';

import { folderColorIndex } from './records-logic';

/** Folder → chart color: the same primary → warning → info cycle as the folder list; 未分類 is success. */
export function useFolderColors(folders: { id: string }[]) {
  const colors = useTheme();
  const order = folders.map((f) => f.id);
  const palette = [colors.primary, colors.warning, colors.info];
  return (folderId: string | null) => {
    const index = folderColorIndex(order, folderId);
    return index < 0 ? colors.success : (palette[index % palette.length] ?? colors.primary);
  };
}
