import { copyImageFiles, copyImageFilesExclusive, type ImageCopyOps } from './copy-images';

type Fault = 'copy' | 'copyInterrupted' | 'truncate' | 'promote' | 'promoteInterrupted' | 'corruptPromote';

/**
 * In-memory destination directory (full name → content). The content string stands in for the content
 * hash; a prefix of it models a half-written file. `promotePartial` has rename semantics like expo's
 * `move()` without `overwrite` (fails when the target exists); `promoteInterrupted` models Android's
 * copy-then-delete fallback being killed half-way (truncated final file, partial still there).
 */
function createFakeFiles(source: Record<string, string>, destination: Record<string, string> = {}) {
  const dest = new Map(Object.entries(destination));
  const faults = new Map<Fault, Set<string> | 'all'>();
  const fail = (fault: Fault, ...names: string[]) => faults.set(fault, new Set(names));
  const failAll = (fault: Fault) => faults.set(fault, 'all');
  const clearFaults = () => faults.clear();
  const hit = (fault: Fault, name: string) => {
    const f = faults.get(fault);
    return f === 'all' || f?.has(name) === true;
  };
  const ops: ImageCopyOps = {
    listSource: () => Object.keys(source),
    sourceHash: async (n) => source[n] ?? '',
    destinationHash: async (n) => dest.get(n),
    partialHash: async (n) => dest.get(`${n}.partial`),
    destinationIsPrefixOfPartial: async (n) =>
      (dest.get(`${n}.partial`) ?? '').startsWith(dest.get(n) ?? '\u0000'),
    copyToPartial: async (n) => {
      await Promise.resolve();
      if (dest.has(`${n}.partial`)) throw new Error('exists');
      if (hit('copy', n)) throw new Error('copy failed');
      const content = source[n] ?? '';
      if (hit('copyInterrupted', n)) {
        dest.set(`${n}.partial`, content.slice(0, 2)); // killed while writing
        throw new Error('interrupted');
      }
      dest.set(`${n}.partial`, hit('truncate', n) ? content.slice(0, 2) : content);
    },
    promotePartial: async (n) => {
      await Promise.resolve();
      if (hit('promote', n)) throw new Error('promote failed');
      if (dest.has(n)) throw new Error('exists');
      const content = dest.get(`${n}.partial`) ?? '';
      if (hit('promoteInterrupted', n)) {
        dest.set(n, content.slice(0, 2));
        throw new Error('interrupted');
      }
      dest.set(n, hit('corruptPromote', n) ? 'zz' : content);
      dest.delete(`${n}.partial`);
    },
    discardPartial: (n) => void dest.delete(`${n}.partial`),
    discardDestination: (n) => void dest.delete(n),
  };
  const files = () => Object.fromEntries(dest);
  return { ops, dest, files, fail, failAll, clearFaults };
}

const A = 'AAAA-image-a';
const B = 'BBBB-image-b';

describe('copyImageFiles', () => {
  it('copies new images and leaves no partial files', async () => {
    const fs = createFakeFiles({ 'a.jpg': A, 'b.jpg': B });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': A, 'b.jpg': B });
  });

  it('skips an existing identical image without copying', async () => {
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg': A });
    const copy = jest.spyOn(fs.ops, 'copyToPartial');
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copy).not.toHaveBeenCalled();
  });

  it('keeps an existing image of the same size but different content and reports a failure', async () => {
    const other = 'XXXX-image-a'; // same length as A
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg': other });
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': other });
  });

  it('never replaces or deletes an existing different image', async () => {
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg': 'old' });
    const discard = jest.spyOn(fs.ops, 'discardDestination');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(discard).not.toHaveBeenCalled();
    expect(fs.files()).toEqual({ 'a.jpg': 'old' });
  });

  it('fails when copying to .partial fails and creates no final file', async () => {
    const fs = createFakeFiles({ 'a.jpg': A, 'b.jpg': B });
    fs.fail('copy', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'b.jpg': B });
  });

  it('fails when the .partial content does not verify, discards it, and creates no final file', async () => {
    const fs = createFakeFiles({ 'a.jpg': A });
    fs.fail('truncate', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({});
  });

  it('recovers from a copy killed mid-write (unverified .partial is discarded and copied again)', async () => {
    const fs = createFakeFiles({ 'a.jpg': A });
    fs.fail('copyInterrupted', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg.partial': A.slice(0, 2) });
    fs.clearFaults();
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': A });
  });

  it('moves a leftover verified .partial into place without copying again', async () => {
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg.partial': A });
    const copy = jest.spyOn(fs.ops, 'copyToPartial');
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copy).not.toHaveBeenCalled();
    expect(fs.files()).toEqual({ 'a.jpg': A });
  });

  it('discards a leftover .partial with wrong content and copies again', async () => {
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg.partial': 'junk' });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': A });
  });

  it('drops a leftover .partial next to a complete destination', async () => {
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg': A, 'a.jpg.partial': A });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': A });
  });

  it('fails when moving into place fails, keeping the verified .partial for the retry', async () => {
    const fs = createFakeFiles({ 'a.jpg': A });
    fs.fail('promote', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg.partial': A });
    fs.clearFaults();
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': A });
  });

  it('recovers from a move killed mid-way (truncated final file + intact .partial)', async () => {
    const fs = createFakeFiles({ 'a.jpg': A });
    fs.fail('promoteInterrupted', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': A.slice(0, 2), 'a.jpg.partial': A });
    fs.clearFaults();
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': A });
  });

  it('does not delete a mismatching final file that is not a prefix of the verified .partial', async () => {
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg': 'healthy-other', 'a.jpg.partial': A });
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 'healthy-other', 'a.jpg.partial': A });
  });

  it('does not delete a mismatching final file when the .partial itself is unverified', async () => {
    const fs = createFakeFiles({ 'a.jpg': A }, { 'a.jpg': A.slice(0, 2), 'a.jpg.partial': A.slice(0, 5) });
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': A.slice(0, 2), 'a.jpg.partial': A.slice(0, 5) });
  });

  it('reports a failure when the moved file does not verify, and keeps it for inspection', async () => {
    const fs = createFakeFiles({ 'a.jpg': A });
    fs.fail('corruptPromote', 'a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.files()).toEqual({ 'a.jpg': 'zz' });
    fs.clearFaults();
    expect(await copyImageFiles(fs.ops)).toBe(1); // still not overwritten
    expect(fs.files()).toEqual({ 'a.jpg': 'zz' });
  });

  it('retries after a failed import and only copies what is still missing', async () => {
    const fs = createFakeFiles({ 'a.jpg': A, 'b.jpg': B });
    fs.fail('copy', 'b.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    fs.clearFaults();
    const copy = jest.spyOn(fs.ops, 'copyToPartial');
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(fs.files()).toEqual({ 'a.jpg': A, 'b.jpg': B });
  });

  it('is idempotent when the same import runs again', async () => {
    const fs = createFakeFiles({ 'a.jpg': A, 'b.jpg': B });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    const copy = jest.spyOn(fs.ops, 'copyToPartial');
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copy).not.toHaveBeenCalled();
    expect(fs.files()).toEqual({ 'a.jpg': A, 'b.jpg': B });
  });

  it('never modifies the source', async () => {
    const source = { 'a.jpg': A };
    const fs = createFakeFiles(source, { 'a.jpg': 'old' });
    fs.fail('promote', 'a.jpg');
    await copyImageFiles(fs.ops);
    expect(source).toEqual({ 'a.jpg': A });
  });
});

describe('copyImageFilesExclusive', () => {
  it('serializes overlapping runs so they do not collide on .partial files', async () => {
    const fs = createFakeFiles({ 'a.jpg': A, 'b.jpg': B });
    const results = await Promise.all([copyImageFilesExclusive(fs.ops), copyImageFilesExclusive(fs.ops)]);
    expect(results).toEqual([0, 0]);
    expect(fs.files()).toEqual({ 'a.jpg': A, 'b.jpg': B });
  });

  it('keeps working after a run rejected', async () => {
    const fs = createFakeFiles({ 'a.jpg': A });
    jest.spyOn(fs.ops, 'listSource').mockImplementationOnce(() => {
      throw new Error('list failed');
    });
    await expect(copyImageFilesExclusive(fs.ops)).rejects.toThrow('list failed');
    expect(await copyImageFilesExclusive(fs.ops)).toBe(0);
    expect(fs.files()).toEqual({ 'a.jpg': A });
  });
});
