import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadNoteDetail, loadNoteList, saveNote } from '../../features/notes/note-use-cases';
import { createTestDatabase, createTestDeps } from '../test-utils';
import { createRepositories } from './index';

function setup() {
  const { deps, tick } = createTestDeps();
  return { repos: createRepositories(deps), deps, tick };
}

const MARKDOWN = [
  '# 見出し',
  '',
  '  - 先頭の空白と末尾の空白を保持  ',
  '- [ ] チェック',
  '- [x] 済み',
  '',
  '```ts',
  'const a = "<b>&</b>";',
  '```',
  '',
  '[リンク](https://example.com)  ',
  '',
].join('\n');

describe('note repository (Phase 6)', () => {
  it('has no notes at first', () => {
    const { repos } = setup();
    expect(repos.notes.list()).toEqual([]);
    expect(loadNoteList(repos).rows).toEqual([]);
  });

  it('creates a note and stores the Markdown body verbatim', () => {
    const { repos } = setup();
    const note = repos.notes.create({ title: '  文法  ', body: MARKDOWN, folderId: null });
    expect(note).toMatchObject({
      title: '文法',
      body: MARKDOWN,
      folderId: null,
      pinned: false,
      deletedAt: null,
    });
    expect(repos.notes.getById(note.id)?.body).toBe(MARKDOWN);
  });

  it('edits title / body and bumps updatedAt', () => {
    const { repos, tick } = setup();
    const note = repos.notes.create({ title: 'a', body: 'x' });
    tick();
    repos.notes.update(note.id, { title: 'b', body: '# y', folderId: null });
    expect(repos.notes.getById(note.id)).toMatchObject({
      title: 'b',
      body: '# y',
      updatedAt: 2_000,
      createdAt: 1_000,
    });
  });

  it('lists multiple notes pinned first, then newest update first', () => {
    const { repos, tick } = setup();
    const a = repos.notes.create({ title: 'a' });
    tick();
    const b = repos.notes.create({ title: 'b' });
    tick();
    const c = repos.notes.create({ title: 'c' });
    expect(repos.notes.list().map((n) => n.id)).toEqual([c.id, b.id, a.id]);
    tick();
    repos.notes.setPinned(a.id, true);
    expect(repos.notes.list().map((n) => n.id)).toEqual([a.id, c.id, b.id]);
    repos.notes.setPinned(a.id, false);
    expect(repos.notes.list()[0]?.id).toBe(a.id); // most recently updated
  });

  it('searches title and body, and filters by folder / 未分類', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: '韓国語' });
    const inFolder = repos.notes.create({ title: '文法', body: 'abc', folderId: folder.id });
    const loose = repos.notes.create({ title: '雑記', body: '50%_off' });
    expect(repos.notes.list({ query: 'abc' }).map((n) => n.id)).toEqual([inFolder.id]);
    expect(repos.notes.list({ query: '50%_' }).map((n) => n.id)).toEqual([loose.id]);
    expect(repos.notes.list({ folderId: folder.id }).map((n) => n.id)).toEqual([inFolder.id]);
    expect(repos.notes.list({ folderId: null }).map((n) => n.id)).toEqual([loose.id]);
    expect(repos.notes.countsByFolder()).toEqual({ [folder.id]: 1 });
  });

  it('soft-deletes: hidden from reads but kept as a tombstone', () => {
    const { repos, deps, tick } = setup();
    const keep = repos.notes.create({ title: 'keep' });
    const gone = repos.notes.create({ title: 'gone', body: MARKDOWN });
    tick();
    repos.notes.softDelete(gone.id);
    expect(repos.notes.list()).toEqual([keep]);
    expect(repos.notes.getById(gone.id)).toBeUndefined();
    const raw = deps.db.query.notes.findFirst({ where: (t, { eq }) => eq(t.id, gone.id) }).sync();
    expect(raw).toMatchObject({ deletedAt: 2_000, body: MARKDOWN });
  });

  describe('folder association', () => {
    it('attaches a note to a live folder and moves it between folders / 未分類', () => {
      const { repos } = setup();
      const f1 = repos.folders.create({ name: 'f1' });
      const f2 = repos.folders.create({ name: 'f2' });
      const note = repos.notes.create({ title: 'n', folderId: f1.id });
      expect(loadNoteDetail(repos, note.id)?.folder?.id).toBe(f1.id);
      repos.notes.update(note.id, { title: 'n', body: '', folderId: f2.id });
      expect(repos.notes.getById(note.id)?.folderId).toBe(f2.id);
      repos.notes.update(note.id, { title: 'n', body: '', folderId: null });
      expect(loadNoteDetail(repos, note.id)?.folder).toBeNull();
    });

    it('cannot attach to a deleted or unknown folder', () => {
      const { repos } = setup();
      const folder = repos.folders.create({ name: 'gone' });
      const note = repos.notes.create({ title: 'n' });
      repos.folders.softDelete(folder.id);
      expect(() => repos.notes.create({ title: 'x', folderId: folder.id })).toThrow('Folder not found');
      expect(() => repos.notes.update(note.id, { title: 'n', body: '', folderId: folder.id })).toThrow(
        'Folder not found',
      );
      expect(() => repos.notes.create({ folderId: 'missing' })).toThrow('Folder not found');
    });

    it('never offers a deleted folder as a candidate', () => {
      const { repos } = setup();
      const live = repos.folders.create({ name: 'live' });
      const gone = repos.folders.create({ name: 'gone' });
      repos.folders.softDelete(gone.id);
      expect(loadNoteList(repos).folders.map((f) => f.id)).toEqual([live.id]);
    });

    it('keeps notes (uncategorized) when their folder is deleted', () => {
      const { repos } = setup();
      const folder = repos.folders.create({ name: 'f' });
      const note = repos.notes.create({ title: 'n', body: MARKDOWN, folderId: folder.id });
      repos.folders.softDelete(folder.id);
      expect(repos.notes.getById(note.id)).toMatchObject({ folderId: null, body: MARKDOWN, deletedAt: null });
      expect(loadNoteList(repos).rows).toHaveLength(1);
      expect(loadNoteList(repos).rows[0]?.folder).toBeNull();
    });
  });

  describe('auto-save use case', () => {
    it('does not create a note while it is still empty, then creates and updates it', () => {
      const { repos } = setup();
      expect(saveNote(repos, undefined, { title: ' ', body: '\n', folderId: null })).toBeUndefined();
      expect(repos.notes.list()).toEqual([]);
      const id = saveNote(repos, undefined, { title: '', body: '# a', folderId: null });
      expect(id).toBeDefined();
      saveNote(repos, id, { title: 't', body: '# b', folderId: null });
      expect(repos.notes.list()).toHaveLength(1);
      expect(repos.notes.getById(id as string)).toMatchObject({ title: 't', body: '# b' });
    });
  });
});

describe('note persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'tsumi-note-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('restores the exact Markdown after the database is reopened (app restart)', () => {
    const file = path.join(dir, 'notes.db');
    const repos1 = createRepositories(createTestDeps(createTestDatabase(file)).deps);
    const folder = repos1.folders.create({ name: 'f' });
    const note = repos1.notes.create({ title: 'n', body: MARKDOWN, folderId: folder.id });
    repos1.notes.setPinned(note.id, true);
    const removed = repos1.notes.create({ title: 'x' });
    repos1.notes.softDelete(removed.id);

    const repos2 = createRepositories(createTestDeps(createTestDatabase(file)).deps);
    expect(repos2.notes.list()).toHaveLength(1);
    expect(repos2.notes.getById(note.id)).toMatchObject({
      body: MARKDOWN,
      folderId: folder.id,
      pinned: true,
    });
    expect(repos2.notes.getById(removed.id)).toBeUndefined();
  });

  it('keeps Phase 1-5 data and notes when migrations run again on an existing database', () => {
    const file = path.join(dir, 'existing.db');
    const repos1 = createRepositories(createTestDeps(createTestDatabase(file)).deps);
    const folder = repos1.folders.create({ name: 'f' });
    const question = repos1.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    const session = repos1.studySessions.record({ folderId: folder.id, startedAt: 10, endedAt: 70 });
    const note = repos1.notes.create({ title: 'n', body: MARKDOWN, folderId: folder.id });

    const repos2 = createRepositories(createTestDeps(createTestDatabase(file)).deps);
    expect(repos2.folders.list()).toEqual([folder]);
    expect(repos2.questions.getById(question.id)).toEqual(question);
    expect(repos2.studySessions.listBetween(0, 100)).toEqual([session]);
    expect(repos2.notes.getById(note.id)?.body).toBe(MARKDOWN);
  });
});
