import {
  APP_SETTING_KEYS,
  DEFAULT_TIMER_ALERTS,
  parseTimerAlerts,
  serializeTimerAlerts,
  withAlarmMode,
  withSound,
} from './app-settings';

describe('timer alert settings', () => {
  it('defaults to sound (短め) and vibration on', () => {
    expect(parseTimerAlerts(() => undefined)).toEqual(DEFAULT_TIMER_ALERTS);
    expect(DEFAULT_TIMER_ALERTS).toEqual({ sound: true, vibration: true, alarmMode: 'short' });
  });

  it('round-trips each setting independently and ignores garbage', () => {
    const stored = serializeTimerAlerts({ sound: false, vibration: true, alarmMode: 'silent' });
    expect(parseTimerAlerts((key) => stored[key])).toEqual({
      sound: false,
      vibration: true,
      alarmMode: 'silent',
    });
    expect(parseTimerAlerts((key) => (key === APP_SETTING_KEYS.timerVibration ? 'false' : 'oops'))).toEqual({
      sound: true,
      vibration: false,
      alarmMode: 'short',
    });
  });

  it('derives the mode from the legacy sound switch when no mode is stored (backward compatible)', () => {
    const legacyOff = (key: string) => (key === APP_SETTING_KEYS.timerSound ? 'false' : undefined);
    expect(parseTimerAlerts(legacyOff)).toMatchObject({ alarmMode: 'silent', sound: false });
    const legacyOn = (key: string) => (key === APP_SETTING_KEYS.timerSound ? 'true' : undefined);
    expect(parseTimerAlerts(legacyOn)).toMatchObject({ alarmMode: 'short', sound: true });
  });

  it('keeps vibration independent of the alarm mode and the stored mode wins over the legacy switch', () => {
    const stored = serializeTimerAlerts(withAlarmMode({ ...DEFAULT_TIMER_ALERTS, vibration: false }, 'long'));
    expect(stored[APP_SETTING_KEYS.timerAlarmMode]).toBe('long');
    expect(parseTimerAlerts((key) => stored[key])).toEqual({ sound: true, vibration: false, alarmMode: 'long' });
    const conflicting: Record<string, string> = { ...stored, [APP_SETTING_KEYS.timerSound]: 'false' };
    expect(parseTimerAlerts((key) => conflicting[key]).alarmMode).toBe('long');
  });

  it('the 通知音 switch maps to 無音 and back without losing the audible mode', () => {
    const long = withAlarmMode(DEFAULT_TIMER_ALERTS, 'long');
    expect(withSound(long, false)).toMatchObject({ alarmMode: 'silent', sound: false });
    expect(withSound(long, true)).toMatchObject({ alarmMode: 'long', sound: true });
    expect(withSound(withAlarmMode(long, 'silent'), true)).toMatchObject({ alarmMode: 'short', sound: true });
  });
});
