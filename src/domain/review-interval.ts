const MINUTE = 60_000;

/**
 * Human readable length of a review interval ("10分", "6時間", "1日", "2週間", "1か月", "1年").
 * The single place for the unit boundaries: each step rounds the previous, already rounded unit,
 * so a value never shows as "60分" or "24時間".
 *
 *   < 1分 → "1分未満" · < 60分 → 分 · < 24時間 → 時間 · < 14日 → 日 · < 30日 → 週間 · < 365日 → か月 · 年
 */
export function formatInterval(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / MINUTE);
  if (minutes < 1) return '1分未満';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}日`;
  if (days < 30) return `${Math.round(days / 7)}週間`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))}か月`;
  return `${Math.max(1, Math.round(days / 365))}年`;
}
