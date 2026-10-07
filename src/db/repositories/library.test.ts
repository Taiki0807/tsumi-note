import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ValidationError } from '../../domain/validation';
import { notes } from '../schema';
import { createTestDatabase, createTestDeps } from '../test-utils';
import { createRepositories } from './index';

function setup() {
  const { deps, tick } = createTestDeps();
  return { repos: createRepositories(deps), deps, tick };
}

describe('folder repository (Phase 4)', () => {
  it('creates and reads folders', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: '韓国語' });
    expect(repos.folders.getById(folder.id)).toEqual(folder);
    expect(repos.folders.list()).toEqual([folder]);
  });

  it('renames a folder and bumps updatedAt', () => {
    const { repos, tick } = setup();
    const { id } = repos.folders.create({ name: 'a' });
    tick();
    repos.folders.rename(id, 'b');
    expect(repos.folders.getById(id)).toMatchObject({ name: 'b', updatedAt: 2_000 });
  });

  it('soft-deleted folders disappear from list and getById but stay as tombstones', () => {
    const { repos, deps, tick } = setup();
    const keep = repos.folders.create({ name: 'keep' });
    const gone = repos.folders.create({ name: 'gone' });
    tick();
    repos.folders.softDelete(gone.id);
    expect(repos.folders.list()).toEqual([keep]);
    expect(repos.folders.getById(gone.id)).toBeUndefined();
    const raw = deps.db.query.folders.findFirst({ where: (t, { eq }) => eq(t.id, gone.id) }).sync();
    expect(raw?.deletedAt).toBe(2_000);
  });

  it('does not rename a deleted folder', () => {
    const { repos } = setup();
    const { id } = repos.folders.create({ name: 'a' });
    repos.folders.softDelete(id);
    repos.folders.rename(id, 'b');
    expect(repos.folders.getById(id)).toBeUndefined();
  });

  it.each(['', '   ', '\n\t '])('rejects blank name %j on create and rename', (name) => {
    const { repos } = setup();
    expect(() => repos.folders.create({ name })).toThrow(ValidationError);
    const { id } = repos.folders.create({ name: 'ok' });
    expect(() => repos.folders.rename(id, name)).toThrow(ValidationError);
    expect(repos.folders.getById(id)?.name).toBe('ok');
    expect(repos.folders.list()).toHaveLength(1);
  });

  it('trims names on create and rename', () => {
    const { repos } = setup();
    const { id } = repos.folders.create({ name: '  韓国語 \n' });
    expect(repos.folders.getById(id)?.name).toBe('韓国語');
    repos.folders.rename(id, '  簿記2級  ');
    expect(repos.folders.getById(id)?.name).toBe('簿記2級');
  });
});

describe('question repository (Phase 4)', () => {
  it('creates and reads a question that belongs to a folder', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'f' });
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    expect(q).toMatchObject({ folderId: folder.id, prompt: 'Q', answer: 'A', deletedAt: null });
    expect(repos.questions.getById(q.id)).toEqual(q);
  });

  it('edits prompt and answer and bumps updatedAt', () => {
    const { repos, tick } = setup();
    const folder = repos.folders.create({ name: 'f' });
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    tick();
    repos.questions.update(q.id, { prompt: 'Q2', answer: 'A2' });
    expect(repos.questions.getById(q.id)).toMatchObject({ prompt: 'Q2', answer: 'A2', updatedAt: 2_000 });
  });

  it('soft-deleted questions disappear from reads and counts', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'f' });
    const a = repos.questions.create({ folderId: folder.id, prompt: 'a', answer: 'a' });
    const b = repos.questions.create({ folderId: folder.id, prompt: 'b', answer: 'b' });
    repos.questions.softDelete(a.id);
    expect(repos.questions.getById(a.id)).toBeUndefined();
    expect(repos.questions.listByFolder(folder.id)).toEqual([b]);
    expect(repos.questions.countByFolder(folder.id)).toBe(1);
    expect(repos.questions.countsByFolder()).toEqual({ [folder.id]: 1 });
  });

  it('lists questions per folder, newest first', () => {
    const { repos, tick } = setup();
    const f1 = repos.folders.create({ name: 'f1' });
    const f2 = repos.folders.create({ name: 'f2' });
    const old = repos.questions.create({ folderId: f1.id, prompt: 'old', answer: 'x' });
    tick();
    const recent = repos.questions.create({ folderId: f1.id, prompt: 'new', answer: 'x' });
    const other = repos.questions.create({ folderId: f2.id, prompt: 'other', answer: 'x' });
    expect(repos.questions.listByFolder(f1.id)).toEqual([recent, old]);
    expect(repos.questions.listByFolder(f2.id)).toEqual([other]);
  });

  it.each([
    ['empty prompt', { prompt: '', answer: 'A' }, 'prompt'],
    ['blank prompt', { prompt: '  \n ', answer: 'A' }, 'prompt'],
    ['empty answer', { prompt: 'Q', answer: '' }, 'answer'],
    ['blank answer', { prompt: 'Q', answer: '   ' }, 'answer'],
  ])('rejects %s on create and update', (_label, input, field) => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'f' });
    expect(() => repos.questions.create({ folderId: folder.id, ...input })).toThrow(
      expect.objectContaining({ name: 'ValidationError', field }),
    );
    expect(repos.questions.listByFolder(folder.id)).toEqual([]);

    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    expect(() => repos.questions.update(q.id, input)).toThrow(ValidationError);
    expect(repos.questions.getById(q.id)).toMatchObject({ prompt: 'Q', answer: 'A' });
  });

  it('trims prompt and answer on create and update', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'f' });
    const q = repos.questions.create({ folderId: folder.id, prompt: '  Q \n', answer: ' A  ' });
    expect(q).toMatchObject({ prompt: 'Q', answer: 'A' });
    repos.questions.update(q.id, { prompt: ' Q2 ', answer: '\tA2' });
    expect(repos.questions.getById(q.id)).toMatchObject({ prompt: 'Q2', answer: 'A2' });
  });

  it('refuses to create a question in a missing or deleted folder', () => {
    const { repos } = setup();
    expect(() => repos.questions.create({ folderId: 'nope', prompt: 'Q', answer: 'A' })).toThrow();
    const folder = repos.folders.create({ name: 'f' });
    repos.folders.softDelete(folder.id);
    expect(() => repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' })).toThrow();
  });

  it('does not update a deleted question', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'f' });
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    repos.questions.softDelete(q.id);
    repos.questions.update(q.id, { prompt: 'X', answer: 'Y' });
    expect(repos.questions.getById(q.id)).toBeUndefined();
  });
});

describe('folder deletion semantics', () => {
  it("tombstones the folder's questions, keeps other folders, detaches notes and keeps study sessions", () => {
    const { repos, deps, tick } = setup();
    const target = repos.folders.create({ name: 'target' });
    const other = repos.folders.create({ name: 'other' });
    const q1 = repos.questions.create({ folderId: target.id, prompt: 'a', answer: 'a' });
    repos.questions.create({ folderId: target.id, prompt: 'b', answer: 'b' });
    const otherQ = repos.questions.create({ folderId: other.id, prompt: 'c', answer: 'c' });
    deps.db
      .insert(notes)
      .values({
        id: 'n1',
        folderId: target.id,
        createdAt: 1,
        updatedAt: 1,
        title: 't',
        body: '',
        pinned: false,
      })
      .run();
    const session = repos.studySessions.record({ folderId: target.id, startedAt: 10, endedAt: 70 });
    tick();

    repos.folders.softDelete(target.id);

    expect(repos.questions.listByFolder(target.id)).toEqual([]);
    expect(repos.questions.getById(q1.id)).toBeUndefined();
    expect(repos.questions.listByFolder(other.id)).toEqual([otherQ]);
    const note = deps.db.query.notes.findFirst().sync();
    expect(note).toMatchObject({ folderId: null, deletedAt: null, updatedAt: 2_000 });
    expect(repos.studySessions.listBetween(0, 100)).toEqual([session]);
  });
});

describe('persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'tsumi-note-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps folders and questions after the database is reopened (app restart)', () => {
    const file = path.join(dir, 'app.db');
    const first = createTestDeps(createTestDatabase(file));
    const repos1 = createRepositories(first.deps);
    const folder = repos1.folders.create({ name: '韓国語' });
    const kept = repos1.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    const removed = repos1.questions.create({ folderId: folder.id, prompt: 'X', answer: 'Y' });
    repos1.questions.softDelete(removed.id);

    // New connection + new repositories, as after relaunching the app (migrations re-run safely).
    const repos2 = createRepositories(createTestDeps(createTestDatabase(file)).deps);
    expect(repos2.folders.list()).toEqual([folder]);
    expect(repos2.questions.listByFolder(folder.id)).toEqual([kept]);
    expect(repos2.questions.getById(removed.id)).toBeUndefined();
  });

  it('keeps Phase 3 data (study_sessions) when migrations run again on an existing database', () => {
    const file = path.join(dir, 'phase3.db');
    const repos1 = createRepositories(createTestDeps(createTestDatabase(file)).deps);
    const folder = repos1.folders.create({ name: 'f' });
    const session = repos1.studySessions.record({ folderId: folder.id, startedAt: 10, endedAt: 70 });

    const repos2 = createRepositories(createTestDeps(createTestDatabase(file)).deps);
    expect(repos2.studySessions.listBetween(0, 100)).toEqual([session]);
    expect(repos2.folders.list()).toEqual([folder]);
    expect(repos2.questions.listByFolder(folder.id)).toEqual([]);
  });
});
