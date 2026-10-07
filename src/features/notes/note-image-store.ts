import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { ImageFiles } from './note-images';

/** `<documentDirectory>/note-images/` — app-private, persistent across restarts, not purged like cache. */
function imageDirectory(): Directory {
  const directory = new Directory(Paths.document, 'note-images');
  if (!directory.exists) directory.create({ idempotent: true });
  return directory;
}

/** expo-file-system implementation of {@link ImageFiles}. */
export const noteImageFiles: ImageFiles = {
  list: () =>
    imageDirectory()
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => file.name),
  save: async (sourceUri, fileName) => {
    await new File(sourceUri).copy(new File(imageDirectory(), fileName));
  },
  remove: (fileName) => {
    const file = new File(imageDirectory(), fileName);
    if (file.exists) file.delete();
  },
  modifiedAt: (fileName) => new File(imageDirectory(), fileName).info().modificationTime ?? undefined,
};

/** Displayable `file://` URI for a stored image, or `undefined` when the file is missing. */
export function noteImageUri(fileName: string): string | undefined {
  const file = new File(imageDirectory(), fileName);
  return file.exists ? file.uri : undefined;
}

/**
 * Opens the photo library (iPhone / iPad PHPicker; no permission prompt is needed for picking).
 * Returns `undefined` when the user cancels.
 */
export async function pickPhoto(): Promise<
  { uri: string; fileName?: string | null; mimeType?: string } | undefined
> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.8,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType } : undefined;
}
