import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';

import { newCardState, REVIEW_RATINGS, scheduleReview, type ReviewRating } from './fsrs';

const NOW = Date.UTC(2026, 0, 1, 9, 0, 0);
const DAY = 86_400_000;

const GRADE: Record<ReviewRating, Rating.Again | Rating.Hard | Rating.Good | Rating.Easy> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

describe('newCardState', () => {
  it('is a New card due right away', () => {
    expect(newCardState(NOW)).toMatchObject({
      dueAt: NOW,
      state: State.New,
      reps: 0,
      lapses: 0,
      stability: 0,
      difficulty: 0,
      lastReviewAt: null,
    });
  });
});

describe('scheduleReview (first review of a new question)', () => {
  // Expected values come from ts-fsrs itself, so the wrapper must not change the schedule.
  it.each(REVIEW_RATINGS)('matches ts-fsrs for %s', (rating) => {
    const { card } = fsrs().next(createEmptyCard(new Date(NOW)), new Date(NOW), GRADE[rating]);
    const { next } = scheduleReview(newCardState(NOW), rating, NOW);
    expect(next).toEqual({
      dueAt: card.due.getTime(),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      learningSteps: card.learning_steps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      lastReviewAt: NOW,
    });
  });

  it('keeps the snapshot of the state before the review', () => {
    const { before } = scheduleReview(newCardState(NOW), 'good', NOW);
    expect(before).toMatchObject({ state: State.New, stability: 0, difficulty: 0, dueAt: NOW });
  });

  it('counts the review and records the review time for every rating', () => {
    for (const rating of REVIEW_RATINGS) {
      const { next } = scheduleReview(newCardState(NOW), rating, NOW);
      expect(next.reps).toBe(1);
      expect(next.lastReviewAt).toBe(NOW);
      expect(next.dueAt).toBeGreaterThan(NOW);
    }
  });

  it('schedules later for easier ratings (again < hard <= good < easy)', () => {
    const due = Object.fromEntries(
      REVIEW_RATINGS.map((r) => [r, scheduleReview(newCardState(NOW), r, NOW).next.dueAt]),
    ) as Record<ReviewRating, number>;
    expect(due.again).toBeLessThan(due.hard);
    expect(due.hard).toBeLessThanOrEqual(due.good);
    expect(due.good).toBeLessThan(due.easy);
  });

  it('moves Again / Hard / Good into learning and Easy straight to review', () => {
    expect(scheduleReview(newCardState(NOW), 'again', NOW).next.state).toBe(State.Learning);
    expect(scheduleReview(newCardState(NOW), 'good', NOW).next.state).toBe(State.Learning);
    expect(scheduleReview(newCardState(NOW), 'easy', NOW).next.state).toBe(State.Review);
    expect(scheduleReview(newCardState(NOW), 'easy', NOW).next.dueAt - NOW).toBeGreaterThanOrEqual(DAY);
  });
});

describe('scheduleReview (existing card)', () => {
  it('is deterministic for the same card, rating and time', () => {
    const card = scheduleReview(newCardState(NOW), 'easy', NOW).next;
    const at = card.dueAt + DAY;
    expect(scheduleReview(card, 'good', at)).toEqual(scheduleReview(card, 'good', at));
  });

  it('counts a lapse when a Review card is rated Again', () => {
    const card = scheduleReview(newCardState(NOW), 'easy', NOW).next;
    const { next, before } = scheduleReview(card, 'again', card.dueAt);
    expect(before.state).toBe(State.Review);
    expect(next.lapses).toBe(1);
    expect(next.state).toBe(State.Relearning);
    expect(next.reps).toBe(2);
  });

  it('survives a persistence round trip (plain numbers in, plain numbers out)', () => {
    const first = scheduleReview(newCardState(NOW), 'good', NOW).next;
    const restored = JSON.parse(JSON.stringify(first)) as typeof first;
    const at = first.dueAt;
    expect(scheduleReview(restored, 'good', at)).toEqual(scheduleReview(first, 'good', at));
  });
});
