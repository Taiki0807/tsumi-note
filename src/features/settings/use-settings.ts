import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Appearance } from 'react-native';

import { useRepositories } from '@/db/database-provider';
import type { Goal } from '@/db/repositories';
import type { ReminderSettings } from '@/domain/app-settings';
import type { GoalInput } from '@/domain/goal';
import type { TimerSettings } from '@/features/timer/timer-logic';

import { shareExport } from './export-data';
import { reminderScheduler, type ReminderResult } from './reminder-notifications';
import {
  deleteGoal,
  loadActiveGoal,
  loadDarkMode,
  loadMyPageSummary,
  loadReminder,
  restoreReminder,
  saveDarkMode,
  saveGoal,
  loadTimerSettings,
  saveReminder,
  saveTimerSettings,
  toggleActionPlanItem,
  type MyPageSummary,
} from './settings-use-cases';

/** Mount once inside <DatabaseProvider>: applies the stored Light / Dark choice and restores the reminder. */
export function useApplyStoredSettings(): void {
  const repos = useRepositories();
  useEffect(() => {
    const dark = loadDarkMode(repos);
    // 'unspecified' hands control back to the system; the existing useTheme/useColorScheme follows it.
    Appearance.setColorScheme(dark === null ? 'unspecified' : dark ? 'dark' : 'light');
    void restoreReminder(repos, reminderScheduler);
  }, [repos]);
}

/** My page data, re-read whenever the tab regains focus (goal / settings are edited on other screens). */
export function useMyPage() {
  const repos = useRepositories();
  const [summary, setSummary] = useState<MyPageSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      setSummary(loadMyPageSummary(repos, Date.now()));
    }, [repos]),
  );

  const setDarkMode = useCallback(
    (dark: boolean) => {
      saveDarkMode(repos, dark);
      Appearance.setColorScheme(dark ? 'dark' : 'light');
      setSummary((s) => (s ? { ...s, darkMode: dark } : s));
    },
    [repos],
  );
  return { summary, setDarkMode };
}

export function useGoal() {
  const repos = useRepositories();
  const [goal, setGoal] = useState<Goal | undefined>(() => loadActiveGoal(repos));
  return {
    goal,
    save: (input: GoalInput) => setGoal(saveGoal(repos, input)),
    toggleActionItem: (index: number) => {
      const next = toggleActionPlanItem(repos, index);
      if (next) setGoal(next);
    },
    remove: () => {
      deleteGoal(repos);
      setGoal(undefined);
    },
  };
}

/** Timer settings shared with the timer tab (same storage), edited from マイページ. */
export function useTimerSettings() {
  const repos = useRepositories();
  const [settings, setSettings] = useState<TimerSettings>(() => loadTimerSettings(repos));
  // Re-read on focus: the timer tab can change them too.
  useFocusEffect(
    useCallback(() => {
      setSettings(loadTimerSettings(repos));
    }, [repos]),
  );
  return { settings, update: (next: TimerSettings) => setSettings(saveTimerSettings(repos, next)) };
}

export function useReminderSettings() {
  const repos = useRepositories();
  const [reminder, setReminder] = useState<ReminderSettings>(() => loadReminder(repos));
  const update = async (next: ReminderSettings): Promise<ReminderResult> => {
    const result = await saveReminder(repos, reminderScheduler, next);
    // Always the state that is really stored / in effect (unchanged when the OS call failed).
    setReminder(result.reminder);
    return result;
  };
  return { reminder, update };
}

export function useDataExport() {
  const repos = useRepositories();
  return () => shareExport(repos, Date.now());
}
