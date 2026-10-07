import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useRepositories } from '@/db/database-provider';
import type { ReviewRating } from '@/domain/fsrs';

import {
  advance,
  canRate,
  IDLE_SESSION,
  remainingMs,
  revealAnswer,
  startSession,
  tick,
  type ReviewSessionState,
} from './review-session';
import {
  loadReviewOverview,
  loadReviewSettings,
  saveReviewSettings,
  selectSessionItems,
  submitRating,
  type ReviewOverview,
} from './review-use-cases';
import type { ReviewSettings } from '@/domain/review-settings';

const TICK_MS = 250;

/** Review home data: re-read on focus and after the session changed anything. */
export function useReviewOverview(refreshKey: unknown): ReviewOverview | null {
  const repos = useRepositories();
  const [overview, setOverview] = useState<ReviewOverview | null>(null);
  useFocusEffect(
    useCallback(() => {
      // `refreshKey` is a dependency on purpose: changing it re-reads after a session.
      void refreshKey;
      setOverview(loadReviewOverview(repos, Date.now()));
    }, [repos, refreshKey]),
  );
  return overview;
}

/**
 * Review session hook: glues the pure state machine to SQLite and the clock. The UI only calls
 * `start / showAnswer / rate / quit`; FSRS and SQL stay in the use cases and repositories.
 */
export function useReviewSession() {
  const repos = useRepositories();
  const [state, setStateRaw] = useState<ReviewSessionState>(IDLE_SESSION);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  /** Blocks re-entrant rating while one is being saved. */
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const setState = useCallback((next: ReviewSessionState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  /** Recomputes from the wall clock; used by the ticker and foreground return. */
  const sync = useCallback(() => {
    const at = Date.now();
    setNow(at);
    const next = tick(stateRef.current, at);
    if (next !== stateRef.current) setState(next);
  }, [setState]);

  const timing = state.status === 'active' && state.step === 'question' && state.limitMs !== null;
  useEffect(() => {
    if (!timing) return;
    const id = setInterval(sync, TICK_MS);
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') sync();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [timing, sync]);

  const start = useCallback(
    (folderId?: string) => {
      const at = Date.now();
      const settings = loadReviewSettings(repos);
      const items = selectSessionItems(repos, settings, at, folderId);
      setError(null);
      setNow(at);
      setState(startSession(items, settings, at, randomUUID));
    },
    [repos, setState],
  );

  const showAnswer = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setState(revealAnswer(stateRef.current, at));
  }, [setState]);

  const rate = useCallback(
    (rating: ReviewRating) => {
      const current = stateRef.current;
      if (savingRef.current || !canRate(current)) return;
      savingRef.current = true;
      setSaving(true);
      try {
        const at = Date.now();
        const outcome = submitRating(repos, current, rating, at);
        setError(null);
        setNow(at);
        setState(advance(current, outcome, at, randomUUID));
      } catch {
        // Nothing was stored (single transaction); the user can tap again.
        setError('保存できませんでした。もう一度お試しください');
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [repos, setState],
  );

  const quit = useCallback(() => {
    setError(null);
    setState(IDLE_SESSION);
  }, [setState]);

  return {
    state,
    remainingMs: state.status === 'active' ? remainingMs(state, now) : null,
    now,
    saving,
    error,
    start,
    showAnswer,
    rate,
    quit,
  };
}

/** Settings screen state: loads once, saves explicitly. `dueCount` feeds the "すべて" option. */
export function useReviewSettings() {
  const repos = useRepositories();
  const [initial] = useState(() => loadReviewSettings(repos));
  const [dueCount] = useState(() => repos.review.countDue(Date.now()));
  return { initial, dueCount, save: (next: ReviewSettings) => saveReviewSettings(repos, next) };
}
