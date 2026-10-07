import {
  advance,
  canRate,
  formatCountdown,
  formatNextDue,
  makeOutcome,
  remainingMs,
  revealAnswer,
  startSession,
  summarize,
  tick,
  type ActiveSession,
  type SessionItem,
} from './review-session';

const items = (n: number): SessionItem[] =>
  Array.from({ length: n }, (_, i) => ({
    questionId: `q${i + 1}`,
    prompt: `P${i + 1}`,
    answer: `A${i + 1}`,
    folderName: 'f',
  }));

let seq = 0;
const newId = () => `attempt-${++seq}`;
const timed = { timeLimitEnabled: true, timeLimitSeconds: 45 };
const untimed = { timeLimitEnabled: false, timeLimitSeconds: 45 };
const T0 = 1_000_000;

const active = (s: ReturnType<typeof startSession>) => {
  if (s.status !== 'active') throw new Error('expected active');
  return s;
};

beforeEach(() => {
  seq = 0;
});

describe('startSession', () => {
  it('stays idle with no questions (never invents any)', () => {
    expect(startSession([], timed, T0, newId)).toEqual({ status: 'idle' });
  });

  it('starts on the first question in the question step', () => {
    const s = active(startSession(items(3), timed, T0, newId));
    expect(s).toMatchObject({
      index: 0,
      step: 'question',
      limitMs: 45_000,
      presentedAt: T0,
      attemptId: 'attempt-1',
    });
    expect(canRate(s)).toBe(false);
  });
});

describe('time limit', () => {
  it('counts down from the timestamp, not from ticks', () => {
    const s = active(startSession(items(1), timed, T0, newId));
    expect(remainingMs(s, T0)).toBe(45_000);
    expect(remainingMs(s, T0 + 12_345)).toBe(32_655);
    // A 10-minute gap (background / lock) is accounted for in one step: no rewind, no extension.
    expect(remainingMs(s, T0 + 600_000)).toBe(0);
  });

  it('has no remaining time when there is no limit', () => {
    const s = active(startSession(items(1), untimed, T0, newId));
    expect(s.limitMs).toBeNull();
    expect(remainingMs(s, T0 + 999_999)).toBeNull();
    expect(tick(s, T0 + 999_999)).toBe(s);
  });

  it('keeps the state object while the deadline has not passed', () => {
    const s = startSession(items(1), timed, T0, newId);
    expect(tick(s, T0 + 44_999)).toBe(s);
  });

  it('times out exactly at the deadline and reveals the answer', () => {
    const s = startSession(items(1), timed, T0, newId);
    const out = active(tick(s, T0 + 45_000));
    expect(out).toMatchObject({ step: 'answer', timedOut: true, elapsedMs: 45_000 });
    expect(remainingMs(out, T0 + 90_000)).toBe(0);
    expect(canRate(out)).toBe(true);
  });

  it('times out after returning from the background past the deadline', () => {
    const s = startSession(items(1), timed, T0, newId);
    expect(active(tick(s, T0 + 3_600_000)).timedOut).toBe(true);
  });

  it('stops the timer when the answer is shown', () => {
    const s = startSession(items(1), timed, T0, newId);
    const shown = active(revealAnswer(s, T0 + 10_000));
    expect(shown).toMatchObject({ step: 'answer', timedOut: false, elapsedMs: 10_000 });
    // Time passing afterwards changes nothing: not remaining, not timed out.
    expect(remainingMs(shown, T0 + 500_000)).toBe(35_000);
    expect(tick(shown, T0 + 500_000)).toBe(shown);
  });

  it('counts a late "show answer" tap as a timeout', () => {
    const s = startSession(items(1), timed, T0, newId);
    expect(active(revealAnswer(s, T0 + 50_000))).toMatchObject({ timedOut: true, elapsedMs: 45_000 });
  });

  it('shows the answer without a limit and records the elapsed time', () => {
    const s = startSession(items(1), untimed, T0, newId);
    expect(active(revealAnswer(s, T0 + 70_000))).toMatchObject({
      step: 'answer',
      timedOut: false,
      elapsedMs: 70_000,
    });
  });

  it('ignores a second "show answer"', () => {
    const shown = revealAnswer(startSession(items(1), timed, T0, newId), T0 + 1_000);
    expect(revealAnswer(shown, T0 + 9_000)).toBe(shown);
  });
});

describe('advancing', () => {
  it('moves to the next question with a fresh attempt id and restarted timer', () => {
    const first = active(revealAnswer(startSession(items(2), timed, T0, newId), T0 + 5_000));
    const next = active(advance(first, makeOutcome('q1', 'good', false, T0 + 1), T0 + 6_000, newId));
    expect(next).toMatchObject({
      index: 1,
      step: 'question',
      attemptId: 'attempt-2',
      presentedAt: T0 + 6_000,
      elapsedMs: null,
      timedOut: false,
    });
    expect(next.outcomes).toHaveLength(1);
    expect(remainingMs(next, T0 + 6_000)).toBe(45_000);
  });

  it('rejects ratings in the question step, which also blocks a double tap after advancing', () => {
    const shown = active(revealAnswer(startSession(items(2), timed, T0, newId), T0 + 1_000));
    expect(canRate(shown)).toBe(true);
    const next = advance(shown, makeOutcome('q1', 'good', false, 1), T0 + 2_000, newId);
    expect(canRate(next)).toBe(false);
  });

  it('completes after the last question', () => {
    let s = startSession(items(2), untimed, T0, newId);
    for (const [i, rating] of (['good', 'again'] as const).entries()) {
      s = revealAnswer(s, T0 + i);
      s = advance(s as ActiveSession, makeOutcome(`q${i + 1}`, rating, false, T0 + 100), T0 + i, newId);
    }
    expect(s).toMatchObject({ status: 'done', total: 2, skipped: 0 });
  });

  it('skips a question that no longer exists without counting it', () => {
    const s = active(revealAnswer(startSession(items(2), untimed, T0, newId), T0));
    const next = active(advance(s, null, T0, newId));
    expect(next).toMatchObject({ index: 1, skipped: 1, outcomes: [] });
  });
});

describe('summary', () => {
  it('counts solved, accuracy, timeouts and the earliest next due', () => {
    const summary = summarize([
      makeOutcome('a', 'good', false, 5_000),
      makeOutcome('b', 'again', false, 1_000),
      makeOutcome('c', 'easy', true, 9_000), // timed out: not correct
      makeOutcome('d', 'hard', false, 3_000),
    ]);
    expect(summary).toEqual({ solved: 4, correct: 2, timedOut: 1, accuracyPercent: 50, nextDueAt: 1_000 });
  });

  it('is empty-safe', () => {
    expect(summarize([])).toEqual({
      solved: 0,
      correct: 0,
      timedOut: 0,
      accuracyPercent: 0,
      nextDueAt: undefined,
    });
  });
});

describe('formatting', () => {
  it('formats the next due relative to now', () => {
    const now = 1_000_000;
    expect(formatNextDue(now - 5, now)).toBe('まもなく');
    expect(formatNextDue(now + 10 * 60_000, now)).toBe('10分後');
    expect(formatNextDue(now + 3 * 3_600_000, now)).toBe('3時間後');
    expect(formatNextDue(now + 5 * 86_400_000, now)).toBe('5日後');
  });

  it('formats the countdown as mm:ss', () => {
    expect(formatCountdown(32_000)).toBe('00:32');
    expect(formatCountdown(31_001)).toBe('00:32');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(125_000)).toBe('02:05');
  });
});
