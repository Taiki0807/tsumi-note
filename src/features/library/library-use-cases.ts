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

export type FolderDeletionImpact = { questionCount: number; noteCount: number };

/** Use case: what deleting a folder does to its contents, for the confirmation message. */
export function describeFolderDeletion(
  { folders, questions }: LibraryRepos,
  folderId: string,
): FolderDeletionImpact {
  return { questionCount: questions.countByFolder(folderId), noteCount: folders.countNotes(folderId) };
}

/** Confirmation text that matches what `folders.softDelete` actually does. */
export function folderDeletionMessage({ questionCount, noteCount }: FolderDeletionImpact): string {
  const lines = [
    questionCount > 0
      ? `このフォルダー内の問題${questionCount}問も一緒に削除されます。`
      : 'このフォルダーを削除します。',
  ];
  if (noteCount > 0) lines.push(`ノート${noteCount}件は削除されず、フォルダー未設定になります。`);
  return lines.join('\n');
}
