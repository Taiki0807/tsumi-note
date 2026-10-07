import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createRepositories } from '@/db/repositories';
import { createTestDatabase, createTestDeps } from '@/db/test-utils';
import { insertImage } from '@/domain/markdown-format';

import {
  buildImageRef,
  extractImageFiles,
  findOrphanImages,
  imageExtension,
  ORPHAN_GRACE_MS,
  parseImageRef,
  storePickedImage,
  type ImageFiles,
} from './note-images';
import { deleteNote, saveNote, sweepNoteImages } from './note-use-cases';

/** In-memory stand-in for the app's image directory. Survives "restarts" because tests share it. */
function fakeFiles(initial: Record<string, number> = {}) {
  const store = new Map<string, { source: string; modified: number }>(
    Object.entries(initial).map(([name, modified]) => [name, { source: 'seed', modified }]),
  );
  let clock = 0;
  const files: ImageFiles = {
    list: () => [...store.keys()],
    save: async (sourceUri, fileName) => {
      if (store.has(fileName)) throw new Error('exists');
      store.set(fileName, { source: sourceUri, modified: clock });
    },
    remove: (fileName) => void store.delete(fileName),
    modifiedAt: (fileName) => store.get(fileName)?.modified,
  };
  return { files, store, setClock: (t: number) => (clock = t) };
}

describe('image references', () => {
  it('builds and parses note-image:// references', () => {
    expect(buildImageRef('a1.jpg')).toBe('note-image://a1.jpg');
    expect(parseImageRef('note-image://a1.jpg')).toBe('a1.jpg');
  });

  it('rejects anything that is not a plain stored file name', () => {
    expect(parseImageRef('https://x.y/a.jpg')).toBeUndefined();
    expect(parseImageRef('note-image://../secret.jpg')).toBeUndefined();
    expect(parseImageRef('note-image://a/b.jpg')).toBeUndefined();
    expect(parseImageRef('note-image://a.exe')).toBeUndefined();
  });

  it('lists the files a Markdown body needs', () => {
    const body = [
      'text',
      '![画像](note-image://a.jpg)',
      '![](note-image://b.png)',
      '![x](note-image://a.jpg)',
    ].join('\n');
    expect(extractImageFiles(body)).toEqual(['a.jpg', 'b.png']);
    expect(extractImageFiles('![x](https://e.com/a.jpg) [l](note-image://c.jpg)')).toEqual([]);
  });

  it('picks the storage extension from the picked asset', () => {
    expect(imageExtension({ fileName: 'IMG_1.HEIC' })).toBe('heic');
    expect(imageExtension({ mimeType: 'image/jpeg' })).toBe('jpg');
    expect(imageExtension({ uri: 'file:///tmp/x.png' })).toBe('png');
    expect(imageExtension({ fileName: 'a.weird' })).toBe('jpg');
    expect(imageExtension({})).toBe('jpg');
  });
});

describe('storing and referencing a picked image', () => {
  it('copies the file under a generated name and returns the Markdown reference', async () => {
    const { files, store } = fakeFiles();
    const stored = await storePickedImage(files, () => 'uuid-1', {
      uri: 'file:///picker/tmp.jpg',
      fileName: 'IMG_9.jpg',
    });
    expect(stored).toEqual({ fileName: 'uuid-1.jpg', ref: 'note-image://uuid-1.jpg', alt: '画像' });
    expect(store.get('uuid-1.jpg')?.source).toBe('file:///picker/tmp.jpg');
  });

  it('keeps only the reference — never the image data — in the saved Markdown', async () => {
    const { files } = fakeFiles();
    const repos = createRepositories(createTestDeps().deps);
    const image = await storePickedImage(files, () => 'uuid-1', { uri: 'file:///p/a.jpg' });
    const edit = insertImage('本文', { start: 2, end: 2 }, image.ref, image.alt);
    const id = saveNote(repos, undefined, { title: 'T', body: edit.text, folderId: null });

    const body = repos.notes.getById(id!)?.body ?? '';
    expect(body).toBe('本文\n\n![画像](note-image://uuid-1.jpg)\n');
    expect(body).not.toMatch(/base64|file:\/\//);
  });
});

describe('image persistence', () => {
  it('still resolves the image after the app restarts (DB reopened, files kept)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsumi-notes-'));
    const dbFile = path.join(dir, 'app.db');
    const { files } = fakeFiles();

    const first = createRepositories(createTestDeps(createTestDatabase(dbFile)).deps);
    const image = await storePickedImage(files, () => 'uuid-1', { uri: 'file:///p/a.jpg' });
    const id = saveNote(first, undefined, {
      title: 'T',
      body: insertImage('', { start: 0, end: 0 }, image.ref).text,
      folderId: null,
    });

    const second = createRepositories(createTestDeps(createTestDatabase(dbFile)).deps);
    const body = second.notes.getById(id!)?.body ?? '';
    expect(extractImageFiles(body)).toEqual(['uuid-1.jpg']);
    expect(files.list()).toContain('uuid-1.jpg');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the image when the note is edited afterwards', async () => {
    const { files } = fakeFiles();
    const { deps, tick } = createTestDeps();
    const repos = createRepositories(deps);
    const image = await storePickedImage(files, () => 'uuid-1', { uri: 'file:///p/a.jpg' });
    const body = insertImage('', { start: 0, end: 0 }, image.ref).text;
    const id = saveNote(repos, undefined, { title: 'T', body, folderId: null })!;

    tick();
    saveNote(repos, id, { title: 'T2', body: `${body}\n追記`, folderId: null });
    tick(ORPHAN_GRACE_MS * 2);

    expect(sweepNoteImages(repos, files, Date.now() + ORPHAN_GRACE_MS * 2)).toEqual([]);
    expect(files.list()).toEqual(['uuid-1.jpg']);
  });
});

describe('orphan images', () => {
  const day = ORPHAN_GRACE_MS;

  it('removes the images of a deleted note once the grace period has passed', () => {
    const { files, store } = fakeFiles({ 'a.jpg': 0, 'b.jpg': 0 });
    const repos = createRepositories(createTestDeps().deps);
    const keep = repos.notes.create({ body: '![](note-image://a.jpg)' });
    const gone = repos.notes.create({ body: '![](note-image://b.jpg)' });
    repos.notes.softDelete(gone.id);

    expect(sweepNoteImages(repos, files, day * 2)).toEqual(['b.jpg']);
    expect([...store.keys()]).toEqual(['a.jpg']);
    expect(repos.notes.getById(keep.id)).toBeDefined();
  });

  it('removes images that were deleted from the text of a live note', () => {
    const { files } = fakeFiles({ 'a.jpg': 0, 'b.jpg': 0 });
    const repos = createRepositories(createTestDeps().deps);
    const note = repos.notes.create({ body: '![](note-image://a.jpg)\n![](note-image://b.jpg)' });
    repos.notes.update(note.id, { title: '', body: '![](note-image://a.jpg)', folderId: null });

    expect(findOrphanImages(files, [repos.notes.getById(note.id)!.body], day * 2)).toEqual(['b.jpg']);
  });

  it('keeps recently added files that no saved note references yet', () => {
    const { files } = fakeFiles({ 'new.jpg': 1_000 });
    expect(findOrphanImages(files, [], 2_000)).toEqual([]);
    expect(findOrphanImages(files, [], 1_000 + day)).toEqual(['new.jpg']);
  });

  it('keeps an image shared by two notes until both are gone', () => {
    const { files } = fakeFiles({ 'a.jpg': 0 });
    const repos = createRepositories(createTestDeps().deps);
    const first = repos.notes.create({ body: '![](note-image://a.jpg)' });
    const second = repos.notes.create({ body: '![](note-image://a.jpg)' });
    repos.notes.softDelete(first.id);
    expect(sweepNoteImages(repos, files, day * 2)).toEqual([]);
    repos.notes.softDelete(second.id);
    expect(sweepNoteImages(repos, files, day * 2)).toEqual(['a.jpg']);
  });
});

describe('image release on save / delete (no list screen involved)', () => {
  const ref = (n: string) => `![](note-image://${n})`;
  /** Files are brand new (inside the grace period) to prove release does not depend on age. */
  const setup = (names: string[]) => {
    const fake = fakeFiles(Object.fromEntries(names.map((n) => [n, 1_000])));
    const repos = createRepositories(createTestDeps().deps);
    return { ...fake, repos };
  };

  it('removes an image right after it is deleted from the saved text', () => {
    const { files, store, repos } = setup(['a.jpg']);
    const id = saveNote(repos, undefined, { title: 'T', body: ref('a.jpg'), folderId: null }, files)!;
    saveNote(repos, id, { title: 'T', body: '本文のみ', folderId: null }, files);
    expect([...store.keys()]).toEqual([]);
    expect(repos.notes.getById(id)?.body).toBe('本文のみ');
  });

  it('removes only the deleted one of several images', () => {
    const { files, store, repos } = setup(['a.jpg', 'b.jpg', 'c.jpg']);
    const body = [ref('a.jpg'), ref('b.jpg'), ref('c.jpg')].join('\n');
    const id = saveNote(repos, undefined, { title: 'T', body, folderId: null }, files)!;
    saveNote(repos, id, { title: 'T', body: [ref('a.jpg'), ref('c.jpg')].join('\n'), folderId: null }, files);
    expect([...store.keys()].sort()).toEqual(['a.jpg', 'c.jpg']);
  });

  it('keeps an image another note still references', () => {
    const { files, store, repos } = setup(['a.jpg']);
    const first = saveNote(repos, undefined, { title: 'A', body: ref('a.jpg'), folderId: null }, files)!;
    saveNote(repos, undefined, { title: 'B', body: ref('a.jpg'), folderId: null }, files);
    saveNote(repos, first, { title: 'A', body: 'なし', folderId: null }, files);
    expect([...store.keys()]).toEqual(['a.jpg']);
  });

  it('never deletes a file when the save fails', () => {
    const { files, store, repos } = setup(['a.jpg']);
    const id = saveNote(repos, undefined, { title: 'T', body: ref('a.jpg'), folderId: null }, files)!;
    expect(() =>
      saveNote(repos, id, { title: 'T', body: 'なし', folderId: 'missing-folder' }, files),
    ).toThrow();
    expect([...store.keys()]).toEqual(['a.jpg']);
    expect(repos.notes.getById(id)?.body).toBe(ref('a.jpg'));
  });

  it('cleans up the images of a deleted note: none, one, several', () => {
    const { files, store, repos } = setup(['a.jpg', 'b.jpg', 'c.jpg']);
    const none = repos.notes.create({ body: 'text' });
    const one = repos.notes.create({ body: ref('a.jpg') });
    const many = repos.notes.create({ body: [ref('b.jpg'), ref('c.jpg')].join('\n') });
    deleteNote(repos, none.id, files);
    expect(store.size).toBe(3);
    deleteNote(repos, one.id, files);
    expect([...store.keys()].sort()).toEqual(['b.jpg', 'c.jpg']);
    deleteNote(repos, many.id, files);
    expect(store.size).toBe(0);
  });

  it('keeps a deleted note’s image while another note uses it', () => {
    const { files, store, repos } = setup(['a.jpg']);
    const one = repos.notes.create({ body: ref('a.jpg') });
    repos.notes.create({ body: ref('a.jpg') });
    deleteNote(repos, one.id, files);
    expect([...store.keys()]).toEqual(['a.jpg']);
  });

  it('survives a file error and leaves the file for the fallback sweep', () => {
    const { files, repos } = setup(['a.jpg']);
    const note = repos.notes.create({ body: ref('a.jpg') });
    const broken: ImageFiles = {
      ...files,
      remove: () => {
        throw new Error('io');
      },
    };
    expect(() => deleteNote(repos, note.id, broken)).not.toThrow();
    expect(repos.notes.getById(note.id)).toBeUndefined();
    expect(sweepNoteImages(repos, files, ORPHAN_GRACE_MS * 2)).toEqual(['a.jpg']);
  });

  it('keeps referenced images after a restart (DB reopened)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsumi-notes-'));
    const dbFile = path.join(dir, 'app.db');
    const { files, store } = fakeFiles({ 'a.jpg': 0, 'b.jpg': 0 });
    const first = createRepositories(createTestDeps(createTestDatabase(dbFile)).deps);
    const id = saveNote(
      first,
      undefined,
      { title: 'T', body: `${ref('a.jpg')}\n${ref('b.jpg')}`, folderId: null },
      files,
    )!;
    saveNote(first, id, { title: 'T', body: ref('a.jpg'), folderId: null }, files);

    const second = createRepositories(createTestDeps(createTestDatabase(dbFile)).deps);
    expect(extractImageFiles(second.notes.getById(id)?.body ?? '')).toEqual(['a.jpg']);
    expect(sweepNoteImages(second, files, ORPHAN_GRACE_MS * 2)).toEqual([]);
    expect([...store.keys()]).toEqual(['a.jpg']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('existing notes', () => {
  it('plain Markdown notes without images are unaffected', () => {
    const { files } = fakeFiles({ 'a.jpg': 0 });
    const repos = createRepositories(createTestDeps().deps);
    const note = repos.notes.create({ title: '旧ノート', body: '# 見出し\n- a\n[l](https://x.y)' });
    expect(repos.notes.getById(note.id)?.body).toBe('# 見出し\n- a\n[l](https://x.y)');
    expect(extractImageFiles(note.body)).toEqual([]);
    expect(sweepNoteImages(repos, files, ORPHAN_GRACE_MS * 2)).toEqual(['a.jpg']);
  });
});
