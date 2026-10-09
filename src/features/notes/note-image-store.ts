import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { GUEST_IMAGE_DIRECTORY, imageDirectoryForOwner, type OwnerId } from '@/db/ownership';

import { copyImageFiles } from './copy-images';
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
export async function copyGuestImagesToAccount(account: OwnerId): Promise<number> {
  if (account === null) return 0;
  const from = imageDirectory(GUEST_IMAGE_DIRECTORY);
  const to = imageDirectory(imageDirectoryForOwner(account));
  const partialName = (fileName: string) => `${fileName}.partial`;
  const sizeOf = (file: File) => (file.exists ? (file.size ?? undefined) : undefined);
  return copyImageFiles({
    listSource: () => from.list().filter((e): e is File => e instanceof File).map((e) => e.name),
    sourceSize: (name) => new File(from, name).size ?? -1,
    destinationSize: (name) => sizeOf(new File(to, name)),
    copyToPartial: (name) => new File(from, name).copy(new File(to, partialName(name))),
    partialSize: (name) => sizeOf(new File(to, partialName(name))),
    promote: (name) => new File(to, partialName(name)).move(new File(to, name)),
    discardPartial: (name) => {
      const partial = new File(to, partialName(name));
      if (partial.exists) partial.delete();
    },
    removeDestination: (name) => {
      const file = new File(to, name);
      if (file.exists) file.delete();
    },
  });
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
