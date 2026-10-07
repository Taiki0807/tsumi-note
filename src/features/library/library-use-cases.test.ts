import { createRepositories } from '@/db/repositories';
import { notes } from '@/db/schema';
import { createTestDeps } from '@/db/test-utils';

import {
  describeFolderDeletion,
  folderDeletionMessage,
  loadFolderDetail,
  loadFolderList,
} from './library-use-cases';

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
    const detail = loadFolderDetail(repos, folder.id)!;
    expect(detail.folder).toEqual(folder);
    expect(detail.rows.map((r) => r.question)).toEqual([q]);
    expect(describeFolderDeletion(repos, folder.id)).toEqual({ questionCount: 1, noteCount: 0 });

    repos.folders.softDelete(folder.id);
    expect(loadFolderDetail(repos, folder.id)).toBeUndefined();
  });

  it('describes deletion for every question / note combination', () => {
    const noteLine = 'ノート2件は削除されず、フォルダー未設定になります。';
    expect(folderDeletionMessage({ questionCount: 0, noteCount: 0 })).toBe('このフォルダーを削除します。');
    expect(folderDeletionMessage({ questionCount: 3, noteCount: 0 })).toBe(
      'このフォルダー内の問題3問も一緒に削除されます。',
    );
    expect(folderDeletionMessage({ questionCount: 0, noteCount: 2 })).toBe(
      `このフォルダーを削除します。\n${noteLine}`,
    );
    expect(folderDeletionMessage({ questionCount: 3, noteCount: 2 })).toBe(
      `このフォルダー内の問題3問も一緒に削除されます。\n${noteLine}`,
    );
  });

  it('counts live notes, matching what softDelete detaches', () => {
    const { deps } = createTestDeps();
    const repos = createRepositories(deps);
    const folder = repos.folders.create({ name: 'f' });
    const addNote = (id: string, deletedAt: number | null) =>
      deps.db
        .insert(notes)
        .values({
          id,
          folderId: folder.id,
          createdAt: 1,
          updatedAt: 1,
          title: id,
          body: '',
          pinned: false,
          deletedAt,
        })
        .run();
    addNote('n1', null);
    addNote('n2', null);
    addNote('n3', 5);
    expect(describeFolderDeletion(repos, folder.id).noteCount).toBe(2);
    repos.folders.softDelete(folder.id);
    expect(repos.folders.countNotes(folder.id)).toBe(0);
  });
});
