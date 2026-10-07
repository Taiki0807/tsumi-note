import { createRepositories } from '@/db/repositories';
import { createTestDeps } from '@/db/test-utils';

import { describeFolderDeletion, loadFolderDetail, loadFolderList } from './library-use-cases';

function setup() {
  return createRepositories(createTestDeps().deps);
}

describe('library use cases', () => {
  it('returns an empty list and zero totals with no folders', () => {
    expect(loadFolderList(setup())).toEqual({ folders: [], totalQuestions: 0 });
  });

  it('lists folders with question counts, ignoring deleted questions', () => {
    const repos = setup();
    const a = repos.folders.create({ name: 'a' });
    const b = repos.folders.create({ name: 'b' });
    repos.questions.create({ folderId: a.id, prompt: '1', answer: '1' });
    const gone = repos.questions.create({ folderId: a.id, prompt: '2', answer: '2' });
    repos.questions.softDelete(gone.id);

    const list = loadFolderList(repos);
    expect(list.folders.map((f) => [f.name, f.questionCount])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
    expect(list.totalQuestions).toBe(1);
    expect(b.id).toBeDefined();
  });

  it('loads a folder with its questions and returns undefined once deleted', () => {
    const repos = setup();
    const folder = repos.folders.create({ name: 'f' });
    const q = repos.questions.create({ folderId: folder.id, prompt: 'Q', answer: 'A' });
    expect(loadFolderDetail(repos, folder.id)).toEqual({ folder, questions: [q] });
    expect(describeFolderDeletion(repos, folder.id)).toEqual({ questionCount: 1 });

    repos.folders.softDelete(folder.id);
    expect(loadFolderDetail(repos, folder.id)).toBeUndefined();
  });
});
