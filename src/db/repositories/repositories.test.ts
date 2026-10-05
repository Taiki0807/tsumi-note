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

  it('rejects sessions for unknown folders (foreign keys enforced)', () => {
    const { repos } = setup();
    expect(() => repos.studySessions.record({ folderId: 'missing', startedAt: 0, endedAt: 1_000 })).toThrow();
  });

  it('does not expose update or delete', () => {
    const { repos } = setup();
    expect(Object.keys(repos.studySessions).sort()).toEqual(['listSince', 'record']);
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
