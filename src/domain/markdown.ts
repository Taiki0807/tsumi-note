/**
 * Minimal Markdown parser for notes (Phase 6).
 * Supports headings, bullet / numbered lists, checklists, links, code (inline + fenced), quotes
 * and bold. The Markdown *source* is what gets stored; this only produces a display structure.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string };

export type MarkdownBlock =
  | { type: 'heading'; level: number; inline: InlineNode[] }
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'bullet'; inline: InlineNode[] }
  | { type: 'numbered'; number: number; inline: InlineNode[] }
  /** `line` is the 0-based source line, used by `toggleChecklistLine`. */
  | { type: 'check'; checked: boolean; line: number; inline: InlineNode[] }
  | { type: 'quote'; inline: InlineNode[] }
  | { type: 'code'; text: string };

const INLINE_PATTERN = /\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;

export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: 'text', text: source.slice(last, index) });
    if (match[1] !== undefined && match[2] !== undefined) {
      nodes.push({ type: 'link', text: match[1], url: match[2] });
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'code', text: match[3] });
    } else if (match[4] !== undefined) {
      nodes.push({ type: 'bold', text: match[4] });
    }
    last = index + match[0].length;
  }
  if (last < source.length) nodes.push({ type: 'text', text: source.slice(last) });
  return nodes;
}

const CHECK = /^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.split(/\r\n|\r|\n/);
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (FENCE.test(line)) {
      flushParagraph();
      const code: string[] = [];
      i++;
      // An unclosed fence runs to the end of the note.
      while (i < lines.length && !FENCE.test(lines[i] ?? '')) code.push(lines[i++] ?? '');
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    const check = CHECK.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const quote = QUOTE.exec(line);
    if (heading || check || bullet || numbered || quote) flushParagraph();

    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]?.length ?? 1, inline: parseInline(heading[2] ?? '') });
    } else if (check) {
      blocks.push({
        type: 'check',
        checked: check[1] !== ' ',
        line: i,
        inline: parseInline(check[2] ?? ''),
      });
    } else if (bullet) {
      blocks.push({ type: 'bullet', inline: parseInline(bullet[1] ?? '') });
    } else if (numbered) {
      blocks.push({ type: 'numbered', number: Number(numbered[1]), inline: parseInline(numbered[2] ?? '') });
    } else if (quote) {
      blocks.push({ type: 'quote', inline: parseInline(quote[1] ?? '') });
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

export type TextEdit = { text: string; cursor: number };

/** Inserts `prefix` at the start of the line holding `cursor`, or removes it when already there. */
export function toggleLinePrefix(source: string, cursor: number, prefix: string): TextEdit {
  const at = Math.min(Math.max(cursor, 0), source.length);
  const start = source.lastIndexOf('\n', at - 1) + 1;
  if (source.startsWith(prefix, start)) {
    return {
      text: source.slice(0, start) + source.slice(start + prefix.length),
      cursor: Math.max(start, at - prefix.length),
    };
  }
  return { text: source.slice(0, start) + prefix + source.slice(start), cursor: at + prefix.length };
}

/** Inserts `snippet` at `cursor`; the cursor lands `cursorOffset` characters into the snippet. */
export function insertSnippet(
  source: string,
  cursor: number,
  snippet: string,
  cursorOffset = snippet.length,
): TextEdit {
  const at = Math.min(Math.max(cursor, 0), source.length);
  return { text: source.slice(0, at) + snippet + source.slice(at), cursor: at + cursorOffset };
}

/** Flips `- [ ]` ⇄ `- [x]` on one source line; every other character of the body is preserved. */
export function toggleChecklistLine(source: string, line: number): string {
  const parts = source.split(/(\r\n|\r|\n)/); // keeps the original line endings
  const index = line * 2;
  const target = parts[index];
  if (target === undefined) return source;
  parts[index] = target.replace(/\[([ xX])\]/, (_, mark: string) => (mark === ' ' ? '[x]' : '[ ]'));
  return parts.join('');
}
