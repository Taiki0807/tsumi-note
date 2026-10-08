import type { Folder, Repositories } from '@/db/repositories';

import {
  filterRows,
  isWeak,
  sortByIncorrectRate,
  toQuestionRow,
  type QuestionFilter,
  type QuestionRow,
} from './question-list';

type LibraryRepos = Pick<Repositories, 'folders' | 'questions'>;
type LibraryReviewRepos = LibraryRepos & Pick<Repositories, 'review'>;

export type FolderSummary = Folder & { questionCount: number; dueCount: number };

export type FolderList = {
  folders: FolderSummary[];
  /** Questions in the folders listed (i.e. after the search). */
  totalQuestions: number;
};

/**
 * Use case: folders with their live question and due counts (folder list screen).
 * A non-blank `query` keeps folders whose name contains it.
 */
export function loadFolderList(
  { folders, questions, review }: LibraryReviewRepos,
  options: { query?: string; now?: number } = {},
): FolderList {
  const counts = questions.countsByFolder();
  const due = review.countDueByFolder(options.now);
  const items = folders.list({ query: options.query }).map((folder) => ({
    ...folder,
    questionCount: counts[folder.id] ?? 0,
    dueCount: due[folder.id] ?? 0,
  }));
  return { folders: items, totalQuestions: items.reduce((sum, f) => sum + f.questionCount, 0) };
}

export type FolderDetail = {
  folder: Folder;
  /** Questions matching the search and the filter, highest incorrect rate first. */
  rows: QuestionRow[];
  /** Tab counts, computed over the questions matching the search. */
  counts: Record<QuestionFilter, number>;
  /** Due questions in the whole folder, independent of search / filter. */
  dueCount: number;
  /** Questions 「N問を復習」 starts: the rows shown (search AND filter), capped by `sessionLimit`. */
  reviewCount: number;
};

/** Use case: one folder's question management; `undefined` when the folder does not exist or was deleted. */
export function loadFolderDetail(
  { folders, questions, review }: LibraryReviewRepos,
  folderId: string,
  options: { query?: string; filter?: QuestionFilter; now?: number; sessionLimit?: number } = {},
): FolderDetail | undefined {
  const folder = folders.getById(folderId);
  if (!folder) return undefined;
  const stats = review.answerStatsByFolder(folderId);
  const dueIds = new Set(review.listDue({ at: options.now, folderId }).map((d) => d.question.id));
  const rows = sortByIncorrectRate(
    questions
      .listByFolder(folderId, { query: options.query })
      .map((q) => toQuestionRow(q, stats[q.id], dueIds.has(q.id))),
  );
  const shown = filterRows(rows, options.filter ?? 'all');
  return {
    folder,
    rows: shown,
    counts: { all: rows.length, due: rows.filter((r) => r.isDue).length, weak: rows.filter(isWeak).length },
    dueCount: dueIds.size,
    reviewCount:
      options.sessionLimit === undefined ? shown.length : Math.min(shown.length, options.sessionLimit),
  };
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
export function folderDeletionMessage(
  { questionCount, noteCount }: FolderDeletionImpact,
  name: string,
): string {
  // Figma 08c: 「韓国語」フォルダーと、中の問題120問が削除されます。この操作は取り消せません。
  const lines = [
    questionCount > 0
      ? `「${name}」フォルダーと、中の問題${questionCount}問が削除されます。この操作は取り消せません。`
      : `「${name}」フォルダーが削除されます。この操作は取り消せません。`,
  ];
  if (noteCount > 0) lines.push(`ノート${noteCount}件は削除されず、フォルダー未設定になります。`);
  return lines.join('\n');
}
