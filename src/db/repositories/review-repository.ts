import { and, asc, count, eq, isNull, lte, sql } from 'drizzle-orm';

import { newCardState, scheduleReview, type FsrsCardState, type ReviewRating } from '../../domain/fsrs';
import { answerHistory, folders, fsrsStates, questions, reviewHistory } from '../schema';
import type { RepositoryDeps } from '../types';
import type { Question } from './question-repository';

export type ReviewHistoryEntry = typeof reviewHistory.$inferSelect;

export type DueQuestion = {
  question: Question;
  folderName: string;
  /** Persisted FSRS state, or a fresh card for a question that was never reviewed. */
  card: FsrsCardState;
  isNew: boolean;
};

export type ApplyRatingInput = {
  /**
   * Unique id of this review attempt (one per question presentation). It becomes the
   * `review_history` primary key, so submitting the same attempt twice is a no-op.
   */
  attemptId: string;
  questionId: string;
  rating: ReviewRating;
  timedOut: boolean;
  elapsedMs: number | null;
};

export type ApplyRatingResult =
  | { status: 'recorded'; card: FsrsCardState; reviewedAt: number }
  | { status: 'duplicate'; card: FsrsCardState | undefined }
  | { status: 'question-missing' };

/** Answer History totals of one question. */
export type AnswerStats = { attempts: number; incorrect: number; timeouts: number };

type StateRow = typeof fsrsStates.$inferSelect;

function rowToCard(row: StateRow): FsrsCardState {
  return {
    dueAt: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReviewAt: row.lastReview,
  };
}

function cardToColumns(card: FsrsCardState) {
  return {
    due: card.dueAt,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.lastReviewAt,
  };
}

/**
 * FSRS state (mutable, one row per question) + Review History (append-only).
 * A question without an `fsrs_states` row is new and due as of its creation time.
 * All due comparisons are epoch-ms integers, so they do not depend on the time zone.
 */
export function createReviewRepository({ db, now }: RepositoryDeps) {
  // Questions with no FSRS row are due from the moment they were created.
  const effectiveDue = sql<number>`coalesce(${fsrsStates.due}, ${questions.createdAt})`;
  const liveQuestion = and(isNull(questions.deletedAt), isNull(folders.deletedAt));
  const inFolder = (folderId: string | undefined) =>
    folderId ? eq(questions.folderId, folderId) : undefined;

  return {
    getState(questionId: string): FsrsCardState | undefined {
      const row = db.select().from(fsrsStates).where(eq(fsrsStates.questionId, questionId)).get();
      return row ? rowToCard(row) : undefined;
    },

    /**
     * Due questions, nearest due first (ties: oldest question first). `limit` omitted = all;
     * `folderId` restricts the result to one folder.
     */
    listDue(options: { at?: number; limit?: number; folderId?: string } = {}): DueQuestion[] {
      const at = options.at ?? now();
      const rows = db
        .select({ question: questions, state: fsrsStates, folderName: folders.name })
        .from(questions)
        .innerJoin(folders, eq(folders.id, questions.folderId))
        .leftJoin(fsrsStates, eq(fsrsStates.questionId, questions.id))
        .where(and(liveQuestion, lte(effectiveDue, at), inFolder(options.folderId)))
        .orderBy(asc(effectiveDue), asc(questions.createdAt), asc(questions.id))
        .limit(options.limit ?? -1)
        .all();
      return rows.map(({ question, state, folderName }) => ({
        question,
        folderName,
        card: state ? rowToCard(state) : newCardState(question.createdAt),
        isNew: state === null,
      }));
    },

    countDue(at: number = now(), folderId?: string): number {
      return (
        db
          .select({ total: count() })
          .from(questions)
          .innerJoin(folders, eq(folders.id, questions.folderId))
          .leftJoin(fsrsStates, eq(fsrsStates.questionId, questions.id))
          .where(and(liveQuestion, lte(effectiveDue, at), inFolder(folderId)))
          .get()?.total ?? 0
      );
    },

    /** Due question count per folder id (folders with nothing due are absent). */
    countDueByFolder(at: number = now()): Record<string, number> {
      const rows = db
        .select({ folderId: questions.folderId, total: count() })
        .from(questions)
        .innerJoin(folders, eq(folders.id, questions.folderId))
        .leftJoin(fsrsStates, eq(fsrsStates.questionId, questions.id))
        .where(and(liveQuestion, lte(effectiveDue, at)))
        .groupBy(questions.folderId)
        .all();
      return Object.fromEntries(rows.map((r) => [r.folderId, r.total]));
    },

    /**
     * Answer History totals per live question of a folder (never-answered questions are absent).
     * `incorrect` counts `incorrect` only; `timeouts` are kept apart (PRODUCT_SPEC: 時間切れは
     * 不正解とは別に集計) but both count towards `attempts`.
     */
    answerStatsByFolder(folderId: string): Record<string, AnswerStats> {
      const rows = db
        .select({
          questionId: answerHistory.questionId,
          attempts: count(),
          incorrect: sql<number>`coalesce(sum(case when ${answerHistory.result} = 'incorrect' then 1 else 0 end), 0)`,
          timeouts: sql<number>`coalesce(sum(case when ${answerHistory.result} = 'timeout' then 1 else 0 end), 0)`,
        })
        .from(answerHistory)
        .innerJoin(questions, eq(questions.id, answerHistory.questionId))
        .where(and(eq(questions.folderId, folderId), isNull(questions.deletedAt)))
        .groupBy(answerHistory.questionId)
        .all();
      return Object.fromEntries(
        rows.map((r) => [
          r.questionId,
          { attempts: r.attempts, incorrect: Number(r.incorrect), timeouts: Number(r.timeouts) },
        ]),
      );
    },

    /** Live questions regardless of schedule: tells "no questions at all" from "nothing due now". */
    countReviewable(): number {
      return (
        db
          .select({ total: count() })
          .from(questions)
          .innerJoin(folders, eq(folders.id, questions.folderId))
          .where(liveQuestion)
          .get()?.total ?? 0
      );
    },

    /** Earliest due time among questions that are not due yet (the "next review"), if any. */
    nextDueAfter(at: number = now()): number | undefined {
      const row = db
        .select({ due: sql<number>`min(${fsrsStates.due})` })
        .from(fsrsStates)
        .innerJoin(questions, eq(questions.id, fsrsStates.questionId))
        .innerJoin(folders, eq(folders.id, questions.folderId))
        .where(and(liveQuestion, sql`${fsrsStates.due} > ${at}`))
        .get();
      return row?.due ?? undefined;
    },

    /** Oldest first. */
    listHistory(questionId: string): ReviewHistoryEntry[] {
      return db
        .select()
        .from(reviewHistory)
        .where(eq(reviewHistory.questionId, questionId))
        .orderBy(asc(reviewHistory.reviewedAt), asc(reviewHistory.createdAt))
        .all();
    },

    /**
     * Rates a question: computes the next FSRS state with `ts-fsrs`, overwrites the current
     * state, appends Review History and Answer History - all in ONE transaction, so a failure
     * leaves nothing behind. Idempotent per `attemptId` (a repeated tap changes nothing).
     */
    applyRating(input: ApplyRatingInput): ApplyRatingResult {
      return db.transaction((tx) => {
        const existing = tx
          .select({ id: reviewHistory.id })
          .from(reviewHistory)
          .where(eq(reviewHistory.id, input.attemptId))
          .get();
        const current = tx.select().from(fsrsStates).where(eq(fsrsStates.questionId, input.questionId)).get();
        if (existing) return { status: 'duplicate', card: current ? rowToCard(current) : undefined };

        const question = tx
          .select({ id: questions.id, createdAt: questions.createdAt })
          .from(questions)
          .innerJoin(folders, eq(folders.id, questions.folderId))
          .where(and(eq(questions.id, input.questionId), liveQuestion))
          .get();
        if (!question) return { status: 'question-missing' };

        const reviewedAt = now();
        const before = current ? rowToCard(current) : newCardState(question.createdAt);
        const { next, before: snapshot } = scheduleReview(before, input.rating, reviewedAt);

        tx.insert(reviewHistory)
          .values({
            id: input.attemptId,
            createdAt: reviewedAt,
            questionId: input.questionId,
            rating: input.rating,
            reviewedAt,
            timedOut: input.timedOut,
            elapsedMs: input.elapsedMs,
            state: snapshot.state,
            due: snapshot.dueAt,
            stability: snapshot.stability,
            difficulty: snapshot.difficulty,
            scheduledDays: snapshot.scheduledDays,
            learningSteps: snapshot.learningSteps,
          })
          .run();
        tx.insert(answerHistory)
          .values({
            id: input.attemptId,
            createdAt: reviewedAt,
            questionId: input.questionId,
            result: input.timedOut ? 'timeout' : input.rating === 'again' ? 'incorrect' : 'correct',
            answeredAt: reviewedAt,
          })
          .run();
        tx.insert(fsrsStates)
          .values({ questionId: input.questionId, ...cardToColumns(next), updatedAt: reviewedAt })
          .onConflictDoUpdate({
            target: fsrsStates.questionId,
            set: { ...cardToColumns(next), updatedAt: reviewedAt },
          })
          .run();

        return { status: 'recorded', card: next, reviewedAt };
      });
    },
  };
}

export type ReviewRepository = ReturnType<typeof createReviewRepository>;
