const pad = (n: number) => String(n).padStart(2, '0');

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Figma 03 meta: 「今日 10:30」 / 「昨日 22:17」 / 「9月7日」 (older). */
export function formatNoteTime(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp);
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / 86_400_000);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (days === 0) return `今日 ${time}`;
  if (days === 1) return `昨日 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export const UNTITLED_NOTE = '無題のノート';

export function noteDisplayTitle(title: string): string {
  return title.trim() === '' ? UNTITLED_NOTE : title;
}

/** Nothing worth saving yet: a new note stays unsaved until it has a title or a body. */
export function isNoteEmpty(input: { title: string; body: string }): boolean {
  return input.title.trim() === '' && input.body.trim() === '';
}
