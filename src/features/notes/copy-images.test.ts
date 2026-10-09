import { copyImageFiles, copyImageFilesExclusive, ImageRestoreError, type ImageCopyOps } from './copy-images';

type Fault = 'copy' | 'truncate' | 'backup' | 'promote' | 'restore';

/**
 * In-memory destination directory (full name → size) with rename semantics like expo's `move()` without
 * `overwrite`: moving onto an existing file fails. The source is read-only and checked for changes.
 */
function createFakeFiles(source: Record<string, number>, destination: Record<string, number> = {}) {
  const dest = new Map(Object.entries(destination));
  const faults = new Map<Fault, Set<string> | 'all'>();
  const fail = (fault: Fault, ...names: string[]) => faults.set(fault, new Set(names));
  const failAll = (fault: Fault) => faults.set(fault, 'all');
  const clearFaults = () => faults.clear();
  const hit = (fault: Fault, name: string) => {
    const f = faults.get(fault);
    return f === 'all' || f?.has(name) === true;
  };
  const rename = async (from: string, to: string) => {
    await Promise.resolve();
    if (!dest.has(from)) throw new Error('missing');
    if (dest.has(to)) throw new Error('exists');
    dest.set(to, dest.get(from) as number);
    dest.delete(from);
  };
  const ops: ImageCopyOps = {
    listSource: () => Object.keys(source),
    sourceSize: (n) => source[n] ?? -1,
    destinationSize: (n) => dest.get(n),
    partialSize: (n) => dest.get(`${n}.partial`),
    backupSize: (n) => dest.get(`${n}.backup`),
    copyToPartial: async (n) => {
      await Promise.resolve();
      if (hit('copy', n)) throw new Error('copy failed');
      if (dest.has(`${n}.partial`)) throw new Error('exists');
      dest.set(`${n}.partial`, hit('truncate', n) ? 1 : (source[n] ?? -1));
    },
    moveDestinationToBackup: async (n) => {
      if (hit('backup', n)) throw new Error('backup failed');
      await rename(n, `${n}.backup`);
    },
    promotePartial: async (n) => {
      if (hit('promote', n)) throw new Error('promote failed');
      await rename(`${n}.partial`, n);
    },
    restoreBackup: async (n) => {
      if (hit('restore', n)) throw new Error('restore failed');
      await rename(`${n}.backup`, n);
    },
    discardPartial: (n) => void dest.delete(`${n}.partial`),
    discardBackup: (n) => void dest.delete(`${n}.backup`),
    discardDestination: (n) => void dest.delete(n),
  };
  const files = () => Object.fromEntries(dest);
  return { ops, dest, files, fail, failAll, clearFaults, source };
}

describe('copyImageFiles', () => {
  it('copies new images and leaves no partial or backup files', async () => {
    const fs = createFakeFiles({ 'a.jpg': 10, 'b.jpg': 20 });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': 10, 'b.jpg': 20 });
  });

  it('skips an existing image whose size matches', async () => {
    const fs = createFakeFiles({ 'a.jpg': 10 }, { 'a.jpg': 10 });
    const copy = jest.spyOn(fs.ops, 'copyToPartial');
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copy).not.toHaveBeenCalled();
  });

  it('replaces a wrong-sized existing image via backup and then removes the backup', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 4 });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': 30 });
  });

  it('fails when copying to .partial fails and keeps the existing image', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30, 'b.jpg': 5 }, { 'a.jpg': 4 });
    fs.fail('copy', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 4, 'b.jpg': 5 });
  });

  it('fails when the .partial size does not match and keeps the existing image', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 4 });
    fs.fail('truncate', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 4 });
  });

  it('does not create a final file for a new image whose partial is truncated', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 });
    fs.fail('truncate', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({});
  });

  it('fails when the existing image cannot be backed up, leaving it untouched', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 4 });
    fs.fail('backup', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 4 });
  });

  it('restores the existing image when moving the new one into place fails', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 4 });
    fs.fail('promote', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 4 });
  });

  it('propagates a restore failure, keeps the backup, and recovers it on the next run', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30, 'b.jpg': 5 }, { 'a.jpg': 4 });
    fs.fail('promote', 'a.jpg');
    fs.fail('restore', 'a.jpg');
    fs.failAll('promote');
    fs.failAll('restore');
    const error = await copyImageFiles(fs.ops).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageRestoreError);
    expect((error as ImageRestoreError).fileNames).toEqual(['a.jpg']);
    expect(fs.files()['a.jpg.backup']).toBe(4); // the old image is still on disk
    expect(fs.files()['a.jpg.partial']).toBeUndefined();

    fs.clearFaults();
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': 30, 'b.jpg': 5 });
  });

  it('recovers from a leftover .backup whose destination is missing (crash before promotion)', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg.backup': 4, 'a.jpg.partial': 30 });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': 30 });
  });

  it('keeps the old image when recovery works but the retry copy fails', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg.backup': 4 });
    fs.fail('copy', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 4 });
  });

  it('fails without a marker-worthy result when the leftover backup cannot be restored', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg.backup': 4 });
    fs.failAll('restore');
    await expect(copyImageFiles(fs.ops)).rejects.toBeInstanceOf(ImageRestoreError);
    expect(fs.files()).toEqual({ 'a.jpg.backup': 4 });
  });

  it('drops a stale .backup next to a complete destination (crash after promotion)', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 30, 'a.jpg.backup': 4 });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': 30 });
  });

  it('keeps both files when destination and backup are both wrong-sized', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 4, 'a.jpg.backup': 6 });
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 4, 'a.jpg.backup': 6 });
  });

  it('discards a leftover .partial and copies again', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg.partial': 7 });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': 30 });
  });

  it('is idempotent when the same import runs again', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30, 'b.jpg': 5 }, { 'b.jpg': 1 });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    const copy = jest.spyOn(fs.ops, 'copyToPartial');
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copy).not.toHaveBeenCalled();
    expect(fs.files()).toEqual({ 'a.jpg': 30, 'b.jpg': 5 });
  });

  it('never modifies the source', async () => {
    const source = { 'a.jpg': 30 };
    const fs = createFakeFiles(source, { 'a.jpg': 4 });
    fs.fail('promote', 'a.jpg');
    await copyImageFiles(fs.ops);
    expect(source).toEqual({ 'a.jpg': 30 });
  });
});

describe('copyImageFilesExclusive', () => {
  it('serializes overlapping runs so they do not collide on .partial files', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30, 'b.jpg': 5 });
    const results = await Promise.all([copyImageFilesExclusive(fs.ops), copyImageFilesExclusive(fs.ops)]);
    expect(results).toEqual([0, 0]);
    expect(fs.files()).toEqual({ 'a.jpg': 30, 'b.jpg': 5 });
  });

  it('keeps working after a run rejected', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 4 });
    fs.failAll('promote');
    fs.failAll('restore');
    await expect(copyImageFilesExclusive(fs.ops)).rejects.toBeInstanceOf(ImageRestoreError);
    fs.clearFaults();
    expect(await copyImageFilesExclusive(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': 30 });
  });
});
