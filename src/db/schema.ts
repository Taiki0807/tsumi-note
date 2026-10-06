import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Local-first schema (docs/ARCHITECTURE.md §6-§14).
 *
 * - Mutable entities: `id` (UUID, generated offline) + `createdAt` / `updatedAt` / `deletedAt` (tombstone).
 * - Append-only events: `id` + `createdAt` only. Never updated or deleted by the app.
 * - All timestamps are epoch milliseconds (UTC).
 * - Review History (append-only) and FSRS state (mutable, current only) are separate tables.
 * - Account / owner columns are intentionally absent until the Phase 8 auth + sync design decides
 *   the anonymous vs. account-owned data model (ARCHITECTURE.md §15).
 */

const mutableColumns = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
};

const appendOnlyColumns = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
};

// ---------- Mutable entities ----------

export const folders = sqliteTable('folders', {
  ...mutableColumns,
  name: text('name').notNull(),
});

export const notes = sqliteTable(
  'notes',
  {
    ...mutableColumns,
    folderId: text('folder_id').references(() => folders.id),
    title: text('title').notNull().default(''),
    /** Markdown body. */
    body: text('body').notNull().default(''),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('notes_folder_id_idx').on(t.folderId), index('notes_updated_at_idx').on(t.updatedAt)],
);

export const questions = sqliteTable(
  'questions',
  {
    ...mutableColumns,
    folderId: text('folder_id')
      .notNull()
      .references(() => folders.id),
    prompt: text('prompt').notNull(),
    answer: text('answer').notNull(),
  },
  (t) => [index('questions_folder_id_idx').on(t.folderId)],
);

/** v1 manages a single active goal; enforced in the repository layer, not the schema. */
export const goals = sqliteTable('goals', {
  ...mutableColumns,
  title: text('title').notNull(),
  examDate: integer('exam_date'),
  objective: text('objective').notNull().default(''),
  purpose: text('purpose').notNull().default(''),
  actionPlan: text('action_plan').notNull().default(''),
});

/** Key-value settings (reminder time, dark mode, review limits, timer defaults...). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

/**
 * Current FSRS scheduling state, one row per question.
 * `card` stores the serialized `ts-fsrs` Card. Its columns are decided in Phase 5 after the
 * actual ts-fsrs types are verified; `due` is denormalized for "next due" queries.
 */
export const fsrsStates = sqliteTable(
  'fsrs_states',
  {
    questionId: text('question_id')
      .primaryKey()
      .references(() => questions.id),
    due: integer('due').notNull(),
    card: text('card').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('fsrs_states_due_idx').on(t.due)],
);

// ---------- Append-only events ----------

export const studySessions = sqliteTable(
  'study_sessions',
  {
    ...appendOnlyColumns,
    folderId: text('folder_id').references(() => folders.id),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
  },
  (t) => [index('study_sessions_started_at_idx').on(t.startedAt)],
);

export const answerHistory = sqliteTable(
  'answer_history',
  {
    ...appendOnlyColumns,
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    result: text('result', { enum: ['correct', 'incorrect', 'timeout'] }).notNull(),
    answeredAt: integer('answered_at').notNull(),
  },
  (t) => [index('answer_history_question_id_idx').on(t.questionId)],
);

export const reviewHistory = sqliteTable(
  'review_history',
  {
    ...appendOnlyColumns,
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    rating: text('rating', { enum: ['again', 'hard', 'good', 'easy'] }).notNull(),
    reviewedAt: integer('reviewed_at').notNull(),
    timedOut: integer('timed_out', { mode: 'boolean' }).notNull().default(false),
    elapsedMs: integer('elapsed_ms'),
  },
  (t) => [index('review_history_question_id_idx').on(t.questionId)],
);

// ---------- Sync ----------

/** Placeholder for Phase 8 (cursor / device id / last synced time). Not used by Phase 1 code. */
export const syncMetadata = sqliteTable('sync_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
