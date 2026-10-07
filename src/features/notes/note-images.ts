/**
 * Note images (Phase 6).
 *
 * - The image *file* lives in app storage (`note-images/`); SQLite and the Markdown only hold a
 *   reference. Nothing is ever embedded as BLOB / Base64.
 * - The Markdown reference is `![alt](note-image://<fileName>)`. It names the file, not a device
 *   path, so it keeps working when the app container moves (reinstall / OS update) and can be used
 *   as the object key when Phase 8 uploads images to server storage.
 * - File names are random ids and files are never rewritten, so a name always means the same bytes
 *   (safe to sync / cache). The set of files a note needs is derived from its Markdown, so no extra
 *   table (and no migration) is required.
 * - Files nobody references any more are removed by `removeOrphanImages`.
 */

export const NOTE_IMAGE_SCHEME = 'note-image://';

const FILE_NAME = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|gif|webp|heic|heif)$/i;
const IMAGE_REF = /!\[[^\]\n]*\]\(note-image:\/\/([^)\s]+)\)/g;

/** Files younger than this are never treated as orphans: the editor may not have saved them yet. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export function buildImageRef(fileName: string): string {
  return `${NOTE_IMAGE_SCHEME}${fileName}`;
}

/** The file name behind a `note-image://` reference, or `undefined` for anything else / unsafe names. */
export function parseImageRef(ref: string): string | undefined {
  if (!ref.startsWith(NOTE_IMAGE_SCHEME)) return undefined;
  const fileName = ref.slice(NOTE_IMAGE_SCHEME.length);
  return FILE_NAME.test(fileName) ? fileName : undefined;
}

/** Image file names referenced by a Markdown body (each once, in order of appearance). */
export function extractImageFiles(body: string): string[] {
  const names: string[] = [];
  for (const match of body.matchAll(IMAGE_REF)) {
    const fileName = parseImageRef(`${NOTE_IMAGE_SCHEME}${match[1] ?? ''}`);
    if (fileName && !names.includes(fileName)) names.push(fileName);
  }
  return names;
}

/** Storage extension for a picked image (from its file name / MIME type). Defaults to `jpg`. */
export function imageExtension(source: {
  fileName?: string | null;
  mimeType?: string;
  uri?: string;
}): string {
  const fromName = /\.([A-Za-z0-9]+)$/.exec(source.fileName ?? source.uri ?? '')?.[1]?.toLowerCase();
  const fromMime = /^image\/([a-z0-9]+)/.exec(source.mimeType ?? '')?.[1];
  const candidate = (fromName ?? fromMime ?? 'jpg').replace('jpeg', 'jpg');
  return FILE_NAME.test(`x.${candidate}`) ? candidate : 'jpg';
}

/** Abstraction over the app's image directory so the logic is testable without a device. */
export type ImageFiles = {
  /** File names currently stored. */
  list(): string[];
  /** Copies a picked image into storage under `fileName` (never overwrites an existing one). */
  save(sourceUri: string, fileName: string): Promise<void>;
  remove(fileName: string): void;
  /** Last modification time (ms), `undefined` if unknown. */
  modifiedAt(fileName: string): number | undefined;
};

/** Copies a picked image into storage and returns the Markdown snippet pieces for it. */
export async function storePickedImage(
  files: ImageFiles,
  newId: () => string,
  picked: { uri: string; fileName?: string | null; mimeType?: string },
): Promise<{ fileName: string; ref: string; alt: string }> {
  const fileName = `${newId()}.${imageExtension(picked)}`;
  await files.save(picked.uri, fileName);
  return { fileName, ref: buildImageRef(fileName), alt: '画像' };
}

/** Stored files that no live note references and that are older than the grace period. */
export function findOrphanImages(
  files: ImageFiles,
  liveBodies: string[],
  now: number,
  graceMs = ORPHAN_GRACE_MS,
): string[] {
  const used = new Set(liveBodies.flatMap(extractImageFiles));
  return files.list().filter((fileName) => {
    if (used.has(fileName)) return false;
    const modified = files.modifiedAt(fileName);
    return modified === undefined || now - modified >= graceMs;
  });
}

/** Deletes orphan images; returns the removed file names. */
export function removeOrphanImages(
  files: ImageFiles,
  liveBodies: string[],
  now: number,
  graceMs = ORPHAN_GRACE_MS,
): string[] {
  const orphans = findOrphanImages(files, liveBodies, now, graceMs);
  for (const fileName of orphans) files.remove(fileName);
  return orphans;
}
