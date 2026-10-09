/**
 * Minimal file operations needed to copy a directory of images; implemented with expo-file-system.
 *
 * Every `move*` / `restore*` operation MUST be a plain rename that fails when the target exists
 * (no `overwrite` option: expo's overwrite deletes the target before moving, which could lose data).
 * Sizes return `undefined` when the file does not exist.
 */
export type ImageCopyOps = {
  /** File names in the source directory. */
  listSource: () => string[];
  sourceSize: (fileName: string) => number;
  destinationSize: (fileName: string) => number | undefined;
  partialSize: (fileName: string) => number | undefined;
  backupSize: (fileName: string) => number | undefined;
  /** Copies source → `<fileName>.partial`; rejects on failure. The partial must not exist. */
  copyToPartial: (fileName: string) => Promise<void>;
  /** Moves the destination file to `<fileName>.backup`. The backup must not exist. */
  moveDestinationToBackup: (fileName: string) => Promise<void>;
  /** Moves `<fileName>.partial` to the destination. The destination must not exist. */
  promotePartial: (fileName: string) => Promise<void>;
  /** Moves `<fileName>.backup` back to the destination. The destination must not exist. */
  restoreBackup: (fileName: string) => Promise<void>;
  discardPartial: (fileName: string) => Promise<void> | void;
  discardBackup: (fileName: string) => Promise<void> | void;
  /** Deletes a destination file; only used when a complete backup is about to replace a wrong-sized one. */
  discardDestination: (fileName: string) => Promise<void> | void;
};

/** An old destination file could not be put back; it stays as `<name>.backup` and is recovered on the next run. */
export class ImageRestoreError extends Error {
  readonly fileNames: string[];

  constructor(fileNames: string[], options?: { cause?: unknown }) {
    super(`Could not restore existing images: ${fileNames.join(', ')}`, options);
    this.name = 'ImageRestoreError';
    this.fileNames = fileNames;
  }
}

class RestoreFailure extends Error {
  constructor(options: { cause: unknown }) {
    super('restore failed', options);
  }
}

/**
 * Per-file procedure (an existing file is never deleted before its replacement is in place):
 *  1. Recover leftovers of an interrupted run: a `.backup` whose destination is missing is moved back; a
 *     stale `.backup` next to a complete destination is dropped; a `.partial` is discarded (unverified).
 *  2. A destination whose size matches the source is reused.
 *  3. Copy source → `.partial` and verify its size.
 *  4. If a (wrong-sized) destination exists, move it to `.backup`; then move `.partial` into place.
 *  5. If step 4 fails, move `.backup` back. Only after the new file is in place is the backup deleted.
 * The guest source is only read. Failures are counted per file so the caller can refuse to record the
 * import and retry; if an old file could not be restored, an {@link ImageRestoreError} is thrown at the end.
 *
 * @returns the number of files that could not be copied.
 */
export async function copyImageFiles(ops: ImageCopyOps): Promise<number> {
  let failed = 0;
  const unrestored: string[] = [];
  let firstRestoreCause: unknown;
  for (const fileName of ops.listSource()) {
    try {
      await copyOne(ops, fileName);
    } catch (error) {
      failed += 1;
      if (error instanceof RestoreFailure) {
        unrestored.push(fileName);
        firstRestoreCause ??= error.cause;
      }
      try {
        await ops.discardPartial(fileName);
      } catch {
        // Best effort; a leftover partial is discarded on the next attempt.
      }
    }
  }
  if (unrestored.length > 0) throw new ImageRestoreError(unrestored, { cause: firstRestoreCause });
  return failed;
}

async function restore(ops: ImageCopyOps, fileName: string): Promise<void> {
  try {
    await ops.restoreBackup(fileName);
  } catch (cause) {
    throw new RestoreFailure({ cause });
  }
}

async function copyOne(ops: ImageCopyOps, fileName: string): Promise<void> {
  const expected = ops.sourceSize(fileName);
  await recoverLeftovers(ops, fileName, expected);
  const existing = ops.destinationSize(fileName);
  if (existing === expected) return;

  await ops.copyToPartial(fileName);
  if (ops.partialSize(fileName) !== expected) throw new Error('size mismatch');

  if (existing === undefined) {
    await ops.promotePartial(fileName);
    return;
  }
  await ops.moveDestinationToBackup(fileName); // on failure the destination is untouched
  try {
    await ops.promotePartial(fileName);
  } catch (promoteError) {
    await restore(ops, fileName);
    throw promoteError;
  }
  try {
    await ops.discardBackup(fileName);
  } catch {
    // The new file is in place; a stale backup is dropped by the recovery step of the next run.
  }
}

/** Step 1: brings leftovers of an interrupted run back to a state where nothing is lost. */
async function recoverLeftovers(ops: ImageCopyOps, fileName: string, expected: number): Promise<void> {
  const backup = ops.backupSize(fileName);
  if (backup !== undefined) {
    const destination = ops.destinationSize(fileName);
    if (destination === undefined) {
      await restore(ops, fileName);
    } else if (destination === expected) {
      await ops.discardBackup(fileName); // promotion finished, only the cleanup was interrupted
    } else if (backup === expected) {
      await ops.discardDestination(fileName); // wrong-sized file; a complete replacement is at hand
      await restore(ops, fileName);
    } else {
      throw new Error('destination and backup both have an unexpected size'); // keep both, retry later
    }
  }
  await ops.discardPartial(fileName);
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs {@link copyImageFiles} one at a time, so overlapping imports (double tap, re-entry) never operate
 * on the same `.partial` / `.backup` files concurrently; a later run reuses what already finished.
 */
export function copyImageFilesExclusive(ops: ImageCopyOps): Promise<number> {
  const run = queue.then(() => copyImageFiles(ops));
  queue = run.catch(() => undefined);
  return run;
}
