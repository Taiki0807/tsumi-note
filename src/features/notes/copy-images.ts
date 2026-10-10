/**
 * Minimal file operations needed to copy a directory of images; implemented with expo-file-system.
 *
 * Note images are immutable: the file name is a fresh ID (`<id>.<ext>`, see note-images.ts), so the same
 * name always means the same bytes. The import therefore never replaces or backs up an existing file;
 * it only adds missing ones. `promotePartial` MUST be a plain `move` that fails when the target exists
 * (no `overwrite`: expo's overwrite deletes the target first).
 *
 * Hashes are content hashes (SHA-256 hex); `undefined` means the file does not exist.
 */
export type ImageCopyOps = {
  /** File names in the source directory. */
  listSource: () => string[];
  sourceHash: (fileName: string) => Promise<string>;
  destinationHash: (fileName: string) => Promise<string | undefined>;
  partialHash: (fileName: string) => Promise<string | undefined>;
  /** True when the destination file's bytes are a (shorter or equal) prefix of the `.partial` file's bytes. */
  destinationIsPrefixOfPartial: (fileName: string) => Promise<boolean>;
  /** Copies source → `<fileName>.partial`; rejects on failure. The partial must not exist. */
  copyToPartial: (fileName: string) => Promise<void>;
  /** Moves `<fileName>.partial` to the destination. The destination must not exist. */
  promotePartial: (fileName: string) => Promise<void>;
  discardPartial: (fileName: string) => Promise<void> | void;
  /** Deletes a destination file; only used for a file proven to be an incomplete copy of the partial. */
  discardDestination: (fileName: string) => Promise<void> | void;
};

/** A destination file differs from the guest image and could not be proven to be our own unfinished copy. */
export class ImageConflictError extends Error {
  constructor(readonly fileName: string) {
    super(`Existing image differs from the guest image and was kept: ${fileName}`);
    this.name = 'ImageConflictError';
  }
}

/**
 * State of one image after a crash at any point (the guest source is only ever read):
 *
 * | destination        | `.partial`            | meaning / action                                              |
 * |--------------------|-----------------------|---------------------------------------------------------------|
 * | hash = source      | any                   | done; drop the partial (our own temp file)                     |
 * | missing            | missing               | copy to `.partial`                                             |
 * | missing            | hash = source         | verified copy; just move it into place                         |
 * | missing            | other hash            | interrupted copy; discard it and copy again                    |
 * | other hash         | hash = source, and the destination is a prefix of it | interrupted `move` (Android may copy-then-delete): the destination is an unfinished copy of the partial → delete it, move the verified partial |
 * | other hash         | anything else         | cannot be proven ours → keep it, fail (never overwrite)        |
 *
 * `.partial` is only created while the destination is missing, and the sole writer of the destination is
 * the promote step; a deletion happens only for a destination proven to be a prefix of a verified copy.
 * After promotion the destination is hashed again. Any failure counts the file as failed so the caller
 * does not record the import and the user can retry; finished files are reused on the retry.
 *
 * @returns the number of files that could not be copied.
 */
export async function copyImageFiles(ops: ImageCopyOps): Promise<number> {
  let failed = 0;
  for (const fileName of ops.listSource()) {
    try {
      await copyOne(ops, fileName);
    } catch {
      failed += 1;
    }
  }
  return failed;
}

async function copyOne(ops: ImageCopyOps, fileName: string): Promise<void> {
  const expected = await ops.sourceHash(fileName);

  const destination = await ops.destinationHash(fileName);
  if (destination === expected) {
    await ops.discardPartial(fileName);
    return;
  }

  let partial = await ops.partialHash(fileName);
  if (destination !== undefined) {
    if (partial !== expected || !(await ops.destinationIsPrefixOfPartial(fileName))) {
      throw new ImageConflictError(fileName);
    }
    await ops.discardDestination(fileName);
  }

  if (partial !== expected) {
    if (partial !== undefined) await ops.discardPartial(fileName);
    await ops.copyToPartial(fileName);
    partial = await ops.partialHash(fileName);
    if (partial !== expected) {
      await ops.discardPartial(fileName);
      throw new Error(`Copied image failed verification: ${fileName}`);
    }
  }

  await ops.promotePartial(fileName);
  // Keep a mismatching destination (and any remaining partial) for the next run's analysis above.
  if ((await ops.destinationHash(fileName)) !== expected) {
    throw new Error(`Image failed verification after being moved into place: ${fileName}`);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs {@link copyImageFiles} one at a time, so overlapping imports (double tap, re-entry) never operate
 * on the same `.partial` files concurrently; a later run reuses what already finished.
 */
export function copyImageFilesExclusive(ops: ImageCopyOps): Promise<number> {
  const run = queue.then(() => copyImageFiles(ops));
  queue = run.catch(() => undefined);
  return run;
}
