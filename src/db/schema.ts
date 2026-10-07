import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
 * Current FSRS scheduling state, one row per question (ts-fsrs 5.x `Card`).
 * Mutable: overwritten on every review. The per-review record lives in `review_history`.
 * A question without a row is a new card (`createEmptyCard`) that is due immediately.
 * `due` / `last_review` are epoch ms (UTC); `state` is the ts-fsrs `State` enum (0-3).
 */
export const fsrsStates = sqliteTable(
  'fsrs_states',
  {
    questionId: text('question_id')
      .primaryKey()
      .references(() => questions.id),
    due: integer('due').notNull(),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: integer('state').notNull().default(0),
    lastReview: integer('last_review'),
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
    /** Snapshot of the ts-fsrs `ReviewLog`: the card state *before* this review. */
    state: integer('state').notNull().default(0),
    due: integer('due').notNull().default(0),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
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
