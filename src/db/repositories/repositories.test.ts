import { studySessions } from '../schema';
import { createTestDeps } from '../test-utils';
import { createRepositories } from './index';

function setup() {
  const { deps, tick } = createTestDeps();
  return { repos: createRepositories(deps), tick };
}

describe('migrations', () => {
  it('apply cleanly to an empty database', () => {
    const { repos } = setup();
    expect(repos.folders.list()).toEqual([]);
  });
});

describe('folder repository (mutable entity)', () => {
  it('creates folders with a generated id and timestamps', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: '韓国語' });
    expect(folder).toMatchObject({
      id: 'id-1',
      name: '韓国語',
      createdAt: 1_000,
      updatedAt: 1_000,
      deletedAt: null,
    });
    expect(repos.folders.getById('id-1')).toEqual(folder);
  });

  it('assigns the next unused palette color to new folders (the first three match the old cycle)', () => {
    const { repos } = setup();
    const colors = ['a', 'b', 'c', 'd'].map((name) => repos.folders.create({ name }).color);
    expect(colors).toEqual(['primary', 'warning', 'info', 'teal']);
  });

  it('accepts an explicit palette color and ignores unknown values', () => {
    const { repos } = setup();
    expect(repos.folders.create({ name: 'a', color: 'rose' }).color).toBe('rose');
    expect(repos.folders.create({ name: 'b', color: '#ff0000' }).color).toBe('primary');
  });

  it('saves a color on rename / setColor and bumps updatedAt', () => {
    const { repos, tick } = setup();
    const { id } = repos.folders.create({ name: 'a' });
    tick();
    repos.folders.rename(id, 'b', 'pink');
    expect(repos.folders.getById(id)).toMatchObject({ name: 'b', color: 'pink', updatedAt: 2_000 });
    tick();
    repos.folders.setColor(id, 'slate');
    repos.folders.setColor(id, 'not-a-key');
    expect(repos.folders.getById(id)).toMatchObject({ color: 'slate', updatedAt: 3_000 });
  });

  it('bumps updatedAt on rename', () => {
    const { repos, tick } = setup();
    const { id } = repos.folders.create({ name: 'a' });
    tick();
    repos.folders.rename(id, 'b');
    expect(repos.folders.getById(id)).toMatchObject({ name: 'b', createdAt: 1_000, updatedAt: 2_000 });
  });

  it('soft-deletes with a tombstone instead of removing the row', () => {
    const { repos, tick } = setup();
    const { id } = repos.folders.create({ name: 'a' });
    tick();
    repos.folders.softDelete(id);
    expect(repos.folders.getById(id)).toBeUndefined();
    expect(repos.folders.list()).toEqual([]);
  });
});

describe('study session repository (append-only)', () => {
  it('records sessions and derives the duration', () => {
    const { repos } = setup();
    const folder = repos.folders.create({ name: 'a' });
    const session = repos.studySessions.record({
      folderId: folder.id,
      startedAt: 10_000,
      endedAt: 10_000 + 25 * 60_000,
    });
    expect(session.durationSeconds).toBe(1_500);
    expect(repos.studySessions.listSince(0)).toHaveLength(1);
  });

  it('is idempotent for the same id (primary key) and keeps the first record', () => {
    const { repos } = setup();
    const first = repos.studySessions.record({ id: 's1', folderId: null, startedAt: 0, endedAt: 60_000 });
    const second = repos.studySessions.record({ id: 's1', folderId: null, startedAt: 5, endedAt: 90_000 });
    expect(repos.studySessions.listSince(0)).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('enforces the primary key in SQLite itself: a plain duplicate INSERT is rejected', () => {
    const { deps } = createTestDeps();
    const row = { id: 's1', folderId: null, startedAt: 0, endedAt: 1_000, durationSeconds: 1, createdAt: 1 };
    deps.db.insert(studySessions).values(row).run();
    expect(() => deps.db.insert(studySessions).values(row).run()).toThrow(/UNIQUE|PRIMARY/i);
    expect(deps.db.select().from(studySessions).all()).toHaveLength(1);
  });

  it('stores an explicit duration independent of startedAt / endedAt', () => {
    const { repos } = setup();
    const s = repos.studySessions.record({
      id: 's2',
      folderId: null,
      startedAt: 0,
      endedAt: 3_300_000,
      durationSeconds: 1_500,
    });
    expect(s.durationSeconds).toBe(1_500);
  });

  it('rejects sessions for unknown folders (foreign keys enforced)', () => {
    const { repos } = setup();
    expect(() => repos.studySessions.record({ folderId: 'missing', startedAt: 0, endedAt: 1_000 })).toThrow();
  });

  it('record() stamps updatedAt and leaves deletedAt empty', () => {
    const { repos } = setup();
    const s = repos.studySessions.record({ folderId: null, startedAt: 0, endedAt: 60_000 });
    expect(s).toMatchObject({ createdAt: 1_000, updatedAt: 1_000, deletedAt: null });
  });

  it('update() rewrites the editable fields, bumps updatedAt and keeps createdAt', () => {
    const { repos, tick } = setup();
    const folder = repos.folders.create({ name: '英語' });
    const s = repos.studySessions.record({ id: 's1', folderId: null, startedAt: 0, endedAt: 60_000 });
    tick();
    const updated = repos.studySessions.update(s.id, {
      folderId: folder.id,
      startedAt: 10_000,
      endedAt: 130_000,
      durationSeconds: 120,
    });
    expect(updated).toMatchObject({
      id: 's1',
      folderId: folder.id,
      startedAt: 10_000,
      endedAt: 130_000,
      durationSeconds: 120,
      createdAt: 1_000,
      updatedAt: 2_000,
    });
    expect(repos.studySessions.listSince(0)).toHaveLength(1);
  });

  it('update() does nothing for a missing or deleted session', () => {
    const { repos } = setup();
    const edit = { folderId: null, startedAt: 0, endedAt: 1_000, durationSeconds: 1 };
    expect(repos.studySessions.update('nope', edit)).toBeUndefined();
    repos.studySessions.record({ id: 's1', folderId: null, startedAt: 0, endedAt: 60_000 });
    repos.studySessions.softDelete('s1');
    expect(repos.studySessions.update('s1', edit)).toBeUndefined();
  });

  it('softDelete() tombstones the row and hides it from every read', () => {
    const { repos, tick } = setup();
    repos.studySessions.record({ id: 's1', folderId: null, startedAt: 5_000, endedAt: 65_000 });
    tick();
    repos.studySessions.softDelete('s1');
    expect(repos.studySessions.getById('s1')).toBeUndefined();
    expect(repos.studySessions.listSince(0)).toEqual([]);
    expect(repos.studySessions.listBetween(0, 100_000)).toEqual([]);
  });

  it('record() with an existing id never overwrites an edited row', () => {
    const { repos } = setup();
    repos.studySessions.record({ id: 's1', folderId: null, startedAt: 0, endedAt: 60_000 });
    repos.studySessions.update('s1', {
      folderId: null,
      startedAt: 0,
      endedAt: 120_000,
      durationSeconds: 120,
    });
    const again = repos.studySessions.record({ id: 's1', folderId: null, startedAt: 0, endedAt: 60_000 });
    expect(again.durationSeconds).toBe(120);
  });
});

describe('settings repository', () => {
  it('upserts values', () => {
    const { repos } = setup();
    expect(repos.settings.get('darkMode')).toBeUndefined();
    repos.settings.set('darkMode', 'true');
    repos.settings.set('darkMode', 'false');
    expect(repos.settings.get('darkMode')).toBe('false');
  });
});
