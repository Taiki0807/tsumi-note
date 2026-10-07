import type { Folder, Question, Repositories } from '@/db/repositories';

type LibraryRepos = Pick<Repositories, 'folders' | 'questions'>;

export type FolderSummary = Folder & { questionCount: number };

export type FolderList = {
  folders: FolderSummary[];
  totalQuestions: number;
};

/** Use case: folders with their live question counts (folder list screen). */
export function loadFolderList({ folders, questions }: LibraryRepos): FolderList {
  const counts = questions.countsByFolder();
  const items = folders.list().map((folder) => ({ ...folder, questionCount: counts[folder.id] ?? 0 }));
  return { folders: items, totalQuestions: items.reduce((sum, f) => sum + f.questionCount, 0) };
}

export type FolderDetail = {
  folder: Folder;
  questions: Question[];
};

/** Use case: one folder and its questions; `undefined` when the folder does not exist or was deleted. */
export function loadFolderDetail(
  { folders, questions }: LibraryRepos,
  folderId: string,
): FolderDetail | undefined {
  const folder = folders.getById(folderId);
  return folder ? { folder, questions: questions.listByFolder(folderId) } : undefined;
}

/** Use case: what deleting a folder takes with it, for the confirmation message. */
export function describeFolderDeletion(
  { questions }: LibraryRepos,
  folderId: string,
): { questionCount: number } {
  return { questionCount: questions.countByFolder(folderId) };
}
