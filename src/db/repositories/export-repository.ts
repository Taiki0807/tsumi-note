import {
  answerHistory,
  folders,
  fsrsStates,
  goals,
  notes,
  questions,
  reviewHistory,
  settings,
  studySessions,
} from '../schema';
import type { RepositoryDeps } from '../types';

/** Read-only dump of every user table for Data Export. Tombstoned rows are included as-is. */
export function createExportRepository({ db }: RepositoryDeps) {
  return {
    snapshot() {
      return {
        folders: db.select().from(folders).all(),
        notes: db.select().from(notes).all(),
        questions: db.select().from(questions).all(),
        goals: db.select().from(goals).all(),
        settings: db.select().from(settings).all(),
        fsrsStates: db.select().from(fsrsStates).all(),
        studySessions: db.select().from(studySessions).all(),
        answerHistory: db.select().from(answerHistory).all(),
        reviewHistory: db.select().from(reviewHistory).all(),
      };
    },
  };
}

export type ExportRepository = ReturnType<typeof createExportRepository>;
