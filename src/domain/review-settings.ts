/**
 * Review settings (PRODUCT_SPEC §12 / Figma 11 復習設定): per-question time limit and the
 * number of questions per session. Stored as strings in the key-value `settings` table.
 */
export type ReviewSettings = {
  timeLimitEnabled: boolean;
  timeLimitSeconds: number;
  /** `'all'` = every due question. */
  sessionSize: number | 'all';
};

/** Defaults follow the Figma 11 initial selection: 時間制限あり 45秒 / すべて. */
export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  timeLimitEnabled: true,
  timeLimitSeconds: 45,
  sessionSize: 'all',
};

export const REVIEW_SETTING_LIMITS = {
  timeLimitSeconds: { min: 5, max: 3600 },
  sessionSize: { min: 1, max: 500 },
} as const;

export const REVIEW_SETTING_KEYS = {
  timeLimitEnabled: 'review.timeLimitEnabled',
  timeLimitSeconds: 'review.timeLimitSeconds',
  sessionSize: 'review.sessionSize',
} as const;

function parseIntInRange(raw: string | undefined, min: number, max: number): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return value >= min && value <= max ? value : undefined;
}

/** Reads stored values, falling back to the default for anything missing or invalid. */
export function parseReviewSettings(get: (key: string) => string | undefined): ReviewSettings {
  const enabled = get(REVIEW_SETTING_KEYS.timeLimitEnabled);
  const size = get(REVIEW_SETTING_KEYS.sessionSize);
  const { timeLimitSeconds: seconds, sessionSize } = REVIEW_SETTING_LIMITS;
  return {
    timeLimitEnabled: enabled === undefined ? DEFAULT_REVIEW_SETTINGS.timeLimitEnabled : enabled === 'true',
    timeLimitSeconds:
      parseIntInRange(get(REVIEW_SETTING_KEYS.timeLimitSeconds), seconds.min, seconds.max) ??
      DEFAULT_REVIEW_SETTINGS.timeLimitSeconds,
    sessionSize:
      size === 'all'
        ? 'all'
        : (parseIntInRange(size, sessionSize.min, sessionSize.max) ?? DEFAULT_REVIEW_SETTINGS.sessionSize),
  };
}

/** Whether the values can be saved (the settings screen shows this before enabling 保存). */
export function validateReviewSettings(settings: ReviewSettings): boolean {
  const { timeLimitSeconds, sessionSize } = REVIEW_SETTING_LIMITS;
  const secondsOk =
    !settings.timeLimitEnabled ||
    (Number.isInteger(settings.timeLimitSeconds) &&
      settings.timeLimitSeconds >= timeLimitSeconds.min &&
      settings.timeLimitSeconds <= timeLimitSeconds.max);
  const sizeOk =
    settings.sessionSize === 'all' ||
    (Number.isInteger(settings.sessionSize) &&
      settings.sessionSize >= sessionSize.min &&
      settings.sessionSize <= sessionSize.max);
  return secondsOk && sizeOk;
}

export function serializeReviewSettings(settings: ReviewSettings): Record<string, string> {
  return {
    [REVIEW_SETTING_KEYS.timeLimitEnabled]: String(settings.timeLimitEnabled),
    [REVIEW_SETTING_KEYS.timeLimitSeconds]: String(settings.timeLimitSeconds),
    [REVIEW_SETTING_KEYS.sessionSize]: String(settings.sessionSize),
  };
}
