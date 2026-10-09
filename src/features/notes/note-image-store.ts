import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { GUEST_IMAGE_DIRECTORY, imageDirectoryForOwner, type OwnerId } from '@/db/ownership';

import type { ImageFiles } from './note-images';

/**
 * Image directory of the active data owner (PHASE8_DESIGN §2): the guest keeps `note-images/`, each
 * account has its own directory. Switched together with the database by {@link setImageOwner}.
 */
let activeDirectoryName: string = GUEST_IMAGE_DIRECTORY;

export function setImageOwner(owner: OwnerId): void {
  activeDirectoryName = imageDirectoryForOwner(owner);
}

/** `<documentDirectory>/<owner dir>/` — app-private, persistent across restarts, not purged like cache. */
function imageDirectory(name: string = activeDirectoryName): Directory {
  const directory = new Directory(Paths.document, name);
  if (!directory.exists) directory.create({ idempotent: true });
  return directory;
}

/**
 * Copies the guest's note images into the account's directory (never moves or deletes the originals).
 * Existing files with the same name are kept. Returns the number of files that could not be copied.
 */
export function copyGuestImagesToAccount(account: OwnerId): number {
  if (account === null) return 0;
  const from = imageDirectory(GUEST_IMAGE_DIRECTORY);
  const to = imageDirectory(imageDirectoryForOwner(account));
  let failed = 0;
  for (const entry of from.list()) {
    if (!(entry instanceof File)) continue;
    const target = new File(to, entry.name);
    if (target.exists) continue;
    try {
      entry.copy(target);
    } catch {
      failed += 1;
    }
  }
  return failed;
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
