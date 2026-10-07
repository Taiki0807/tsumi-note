import type { RepositoryDeps } from '../types';
import { createExportRepository } from './export-repository';
import { createFolderRepository } from './folder-repository';
import { createGoalRepository } from './goal-repository';
import { createNoteRepository } from './note-repository';
import { createQuestionRepository } from './question-repository';
import { createReviewRepository } from './review-repository';
import { createSettingsRepository } from './settings-repository';
import { createStudySessionRepository } from './study-session-repository';

export function createRepositories(deps: RepositoryDeps) {
  return {
    folders: createFolderRepository(deps),
    notes: createNoteRepository(deps),
    questions: createQuestionRepository(deps),
    review: createReviewRepository(deps),
    studySessions: createStudySessionRepository(deps),
    settings: createSettingsRepository(deps),
    goals: createGoalRepository(deps),
    exporter: createExportRepository(deps),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

export type { ExportRepository } from './export-repository';
export type { Folder, FolderRepository } from './folder-repository';
export type { Goal, GoalRepository } from './goal-repository';
export type { Note, NoteInput, NoteRepository } from './note-repository';
export type { Question, QuestionRepository } from './question-repository';
export type {
  AnswerStats,
  ApplyRatingInput,
  ApplyRatingResult,
  DueQuestion,
  ReviewHistoryEntry,
  ReviewRepository,
} from './review-repository';
export type { SettingsRepository } from './settings-repository';
export type { StudySession, StudySessionRepository } from './study-session-repository';
