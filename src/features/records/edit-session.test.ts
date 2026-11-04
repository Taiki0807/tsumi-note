import { createRepositories } from '@/db/repositories';
import { createTestDeps } from '@/db/test-utils';

import { loadDayRecord } from './day-record';
import { loadWeeklyRecord } from './load-weekly-record';
import { buildEditedSession } from './manual-session';
import { startOfWeek } from './records-logic';

const local = (m: number, d: number, h = 0, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const DAY = local(10, 28);
const NOW = local(10, 28, 18, 0);

describe('buildEditedSession', () => {
  const original = {
    startedAt: local(10, 28, 9, 0),
    endedAt: local(10, 28, 10, 0),
    durationSeconds: 45 * 60,
  };

  it('keeps the stored duration when the day and times are untouched (e.g. a timer session with pauses)', () => {
    expect(buildEditedSession({ dayStart: DAY, start: '09:00', end: '10:00' }, NOW, original)).toEqual({
      ok: true,
      ...original,
    });
  });

  it('recomputes the duration from start / end once a time changes', () => {
    expect(buildEditedSession({ dayStart: DAY, start: '09:00', end: '10:30' }, NOW, original)).toEqual({
      ok: true,
      startedAt: original.startedAt,
      endedAt: local(10, 28, 10, 30),
      durationSeconds: 90 * 60,
    });
  });

  it('can move the record to another day', () => {
    const result = buildEditedSession(
      { dayStart: local(10, 27), start: '09:00', end: '10:00' },
      NOW,
      original,
    );
    expect(result).toMatchObject({ ok: true, startedAt: local(10, 27, 9, 0), durationSeconds: 3600 });
  });

  it('applies the same validation as a new record', () => {
    expect(buildEditedSession({ dayStart: DAY, start: '10:00', end: '09:00' }, NOW, original).ok).toBe(false);
    expect(buildEditedSession({ dayStart: DAY, start: 'xx', end: '09:00' }, NOW, original).ok).toBe(false);
    expect(buildEditedSession({ dayStart: DAY, start: '09:00', end: '18:30' }, NOW, original).ok).toBe(false);
  });
});

describe('an edited record is reflected in the daily list and the weekly chart', () => {
  it('moves minutes between folders and days immediately', () => {
    const { deps } = createTestDeps();
    const repos = createRepositories(deps);
    const a = repos.folders.create({ name: 'A' });
    const b = repos.folders.create({ name: 'B' });
    const s = repos.studySessions.record({
      id: 's1',
      folderId: a.id,
      startedAt: local(10, 28, 9, 0),
      endedAt: local(10, 28, 10, 0),
    });

    expect(loadDayRecord(repos, DAY).totalSeconds).toBe(3600);

    repos.studySessions.update(s.id, {
      folderId: b.id,
      startedAt: local(10, 27, 9, 0),
      endedAt: local(10, 27, 9, 30),
      durationSeconds: 1800,
    });

    const today = loadDayRecord(repos, DAY);
    expect(today.totalSeconds).toBe(0);
    expect(today.sessions).toEqual([]);
    const yesterday = loadDayRecord(repos, local(10, 27));
    expect(yesterday.sessions).toHaveLength(1);
    expect(yesterday.sessions[0]).toMatchObject({ folderId: b.id, durationSeconds: 1800 });

    const week = loadWeeklyRecord(repos, startOfWeek(DAY));
    expect(week.record.totalSeconds).toBe(1800);
  });
});
