/** Minimal file operations needed to copy a directory of images; implemented with expo-file-system. */
export type ImageCopyOps = {
  /** File names in the source directory. */
  listSource: () => string[];
  /** Byte size of a file in the destination directory, or `undefined` when it does not exist. */
  destinationSize: (fileName: string) => number | undefined;
  sourceSize: (fileName: string) => number;
  /** Copies source → `<fileName>.partial` in the destination; rejects on failure. */
  copyToPartial: (fileName: string) => Promise<void>;
  partialSize: (fileName: string) => number | undefined;
  /** Replaces the destination file with the finished partial copy. */
  promote: (fileName: string) => Promise<void>;
  /** Removes the partial copy if present. */
  discardPartial: (fileName: string) => void;
  /** Removes a destination file (only used for a file whose size does not match the source). */
  removeDestination: (fileName: string) => void;
};

/**
 * Copies every source image into the destination without touching the source. Each file is copied to a
 * temporary name, its size is checked against the source, and only then moved into place, so a final
 * file that exists is always complete. An existing destination file is reused only when its size matches
 * the source; a mismatching leftover is replaced. Failures never throw: they are counted so the caller
 * can refuse to record the import and let the user retry (finished files are reused on the retry).
 *
 * @returns the number of files that could not be copied.
 */
export async function copyImageFiles(ops: ImageCopyOps): Promise<number> {
  let failed = 0;
  for (const fileName of ops.listSource()) {
    try {
      const expected = ops.sourceSize(fileName);
      const existing = ops.destinationSize(fileName);
      if (existing === expected) continue;
      ops.discardPartial(fileName);
      await ops.copyToPartial(fileName);
      if (ops.partialSize(fileName) !== expected) throw new Error('size mismatch');
      if (existing !== undefined) ops.removeDestination(fileName);
      await ops.promote(fileName);
    } catch {
      failed += 1;
      try {
        ops.discardPartial(fileName);
      } catch {
        // Best effort; a leftover partial is discarded on the next attempt.
      }
    }
  }
  return failed;
}
