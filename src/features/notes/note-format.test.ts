import { formatNoteTime, isNoteEmpty, noteDisplayTitle } from './note-format';

describe('formatNoteTime', () => {
  const now = new Date(2026, 8, 8, 12, 0).getTime();
  it('formats today, yesterday and older dates like Figma 03', () => {
    expect(formatNoteTime(new Date(2026, 8, 8, 10, 30).getTime(), now)).toBe('今日 10:30');
    expect(formatNoteTime(new Date(2026, 8, 7, 22, 17).getTime(), now)).toBe('昨日 22:17');
    expect(formatNoteTime(new Date(2026, 8, 6, 9, 0).getTime(), now)).toBe('9月6日');
  });
});

describe('note helpers', () => {
  it('falls back to a placeholder title', () => {
    expect(noteDisplayTitle('  ')).toBe('無題のノート');
    expect(noteDisplayTitle('文法')).toBe('文法');
  });
  it('treats blank title and body as empty', () => {
    expect(isNoteEmpty({ title: ' ', body: '\n ' })).toBe(true);
    expect(isNoteEmpty({ title: '', body: '#' })).toBe(false);
  });
});
