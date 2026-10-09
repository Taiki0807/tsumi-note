import { copyImageFiles, type ImageCopyOps } from './copy-images';

/** In-memory file system: name → size, for source, destination and partial files. */
function createFakeFiles(source: Record<string, number>, destination: Record<string, number> = {}) {
  const dest = new Map(Object.entries(destination));
  const partial = new Map<string, number>();
  const failing = new Set<string>();
  const truncated = new Set<string>();
  const ops: ImageCopyOps = {
    listSource: () => Object.keys(source),
    sourceSize: (name) => source[name] ?? -1,
    destinationSize: (name) => dest.get(name),
    copyToPartial: async (name) => {
      await Promise.resolve();
      if (failing.has(name)) throw new Error('copy failed');
      partial.set(name, truncated.has(name) ? 1 : (source[name] ?? -1));
    },
    partialSize: (name) => partial.get(name),
    promote: async (name) => {
      dest.set(name, partial.get(name) as number);
      partial.delete(name);
    },
    discardPartial: (name) => void partial.delete(name),
    removeDestination: (name) => void dest.delete(name),
  };
  return { ops, dest, partial, failing, truncated };
}

describe('copyImageFiles', () => {
  it('copies every image and leaves no partial files', async () => {
    const fs = createFakeFiles({ 'a.jpg': 10, 'b.jpg': 20 });
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(Object.fromEntries(fs.dest)).toEqual({ 'a.jpg': 10, 'b.jpg': 20 });
    expect(fs.partial.size).toBe(0);
  });

  it('reports failures without exposing a final file, then succeeds on retry reusing finished files', async () => {
    const fs = createFakeFiles({ 'a.jpg': 10, 'b.jpg': 20 });
    fs.failing.add('b.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.dest.has('b.jpg')).toBe(false);
    expect(fs.partial.size).toBe(0);

    const copySpy = jest.spyOn(fs.ops, 'copyToPartial');
    fs.failing.clear();
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copySpy).toHaveBeenCalledTimes(1);
    expect(copySpy).toHaveBeenCalledWith('b.jpg');
    expect(fs.dest.get('b.jpg')).toBe(20);
  });

  it('treats a copy whose size does not match as a failure', async () => {
    const fs = createFakeFiles({ 'a.jpg': 10 });
    fs.truncated.add('a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.dest.has('a.jpg')).toBe(false);
  });

  it('replaces an existing destination file of the wrong size but reuses one of the right size', async () => {
    const fs = createFakeFiles({ 'ok.jpg': 10, 'broken.jpg': 30 }, { 'ok.jpg': 10, 'broken.jpg': 4 });
    const copySpy = jest.spyOn(fs.ops, 'copyToPartial');
    expect(await copyImageFiles(fs.ops)).toBe(0);
    expect(copySpy).toHaveBeenCalledTimes(1);
    expect(fs.dest.get('broken.jpg')).toBe(30);
  });

  it('keeps a wrong-sized destination file if replacing it fails', async () => {
    const fs = createFakeFiles({ 'a.jpg': 30 }, { 'a.jpg': 4 });
    fs.failing.add('a.jpg');
    expect(await copyImageFiles(fs.ops)).toBe(1);
    expect(fs.dest.get('a.jpg')).toBe(4);
  });
});
