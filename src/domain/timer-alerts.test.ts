import {
  APP_SETTING_KEYS,
  DEFAULT_TIMER_ALERTS,
  parseTimerAlerts,
  serializeTimerAlerts,
} from './app-settings';

describe('timer alert settings', () => {
  it('defaults to sound and vibration on', () => {
    expect(parseTimerAlerts(() => undefined)).toEqual(DEFAULT_TIMER_ALERTS);
    expect(DEFAULT_TIMER_ALERTS).toEqual({ sound: true, vibration: true });
  });

  it('round-trips each switch independently and ignores garbage', () => {
    const stored = serializeTimerAlerts({ sound: false, vibration: true });
    expect(parseTimerAlerts((key) => stored[key])).toEqual({ sound: false, vibration: true });
    expect(parseTimerAlerts((key) => (key === APP_SETTING_KEYS.timerVibration ? 'false' : 'oops'))).toEqual({
      sound: true,
      vibration: false,
    });
  });
});
