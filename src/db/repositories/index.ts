import type { RepositoryDeps } from '../types';
import { createFolderRepository } from './folder-repository';
import { createQuestionRepository } from './question-repository';
import { createSettingsRepository } from './settings-repository';
import { createStudySessionRepository } from './study-session-repository';

export function createRepositories(deps: RepositoryDeps) {
  return {
    folders: createFolderRepository(deps),
    questions: createQuestionRepository(deps),
    studySessions: createStudySessionRepository(deps),
    settings: createSettingsRepository(deps),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

export type { Folder, FolderRepository } from './folder-repository';
export type { Question, QuestionRepository } from './question-repository';
export type { SettingsRepository } from './settings-repository';
export type { StudySession, StudySessionRepository } from './study-session-repository';
