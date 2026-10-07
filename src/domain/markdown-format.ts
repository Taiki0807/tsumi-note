/**
 * Toolbar formatting for the note editor (Phase 6). Every function is pure: it takes the Markdown
 * source plus the current selection and returns the new Markdown source and selection. The
 * Markdown string stays the only stored form — the toolbar just writes the right syntax for the user.
 */

export type Selection = { start: number; end: number };
export type FormatEdit = { text: string; selection: Selection };

export type InlineMarker = '**' | '*' | '~~' | '`';

function clamp(source: string, selection: Selection): Selection {
  const a = Math.min(Math.max(selection.start, 0), source.length);
  const b = Math.min(Math.max(selection.end, 0), source.length);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function runBefore(source: string, index: number, char: string): number {
  let n = 0;
  while (index - n - 1 >= 0 && source[index - n - 1] === char) n++;
  return n;
}

function runAfter(source: string, index: number, char: string): number {
  let n = 0;
  while (source[index + n] === char) n++;
  return n;
}

/** Whether `marker` directly surrounds source[start, end). `*` must not be half of a `**` pair. */
function isWrapped(source: string, { start, end }: Selection, marker: InlineMarker): boolean {
  const char = marker[0] ?? '';
  const before = runBefore(source, start, char);
  const after = runAfter(source, end, char);
  const run = Math.min(before, after);
  if (marker === '*') return run === 1 || run === 3;
  return run >= marker.length;
}

/**
 * Bold / italic / strikethrough / inline code.
 * - Selected text is wrapped (`重要です` → `**重要です**`); applying again — whether the selection
 *   includes the markers or only the text between them — unwraps it.
 * - With no selection an empty pair is inserted and the cursor lands inside; on an empty pair the
 *   pair is removed.
 */
export function toggleInline(source: string, rawSelection: Selection, marker: InlineMarker): FormatEdit {
  const selection = clamp(source, rawSelection);
  const { start, end } = selection;
  const size = marker.length;

  // The selection includes the markers themselves: `**text**` selected.
  const inner = source.slice(start, end);
  if (
    inner.length >= size * 2 &&
    inner.startsWith(marker) &&
    inner.endsWith(marker) &&
    !(marker === '*' && inner[1] === '*') &&
    isWrapped(source, { start: start + size, end: end - size }, marker)
  ) {
    return {
      text: source.slice(0, start) + inner.slice(size, inner.length - size) + source.slice(end),
      selection: { start, end: end - size * 2 },
    };
  }

  // Only the text between the markers is selected (or the cursor sits inside an empty pair).
  if (start >= size && source.length - end >= size && isWrapped(source, selection, marker)) {
    return {
      text: source.slice(0, start - size) + inner + source.slice(end + size),
      selection: { start: start - size, end: end - size },
    };
  }

  return {
    text: source.slice(0, start) + marker + inner + marker + source.slice(end),
    selection: { start: start + size, end: end + size },
  };
}

export type BlockKind = 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'check' | 'quote';

const BLOCK_PREFIX = /^(#{1,6}[ \t]+|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>[ \t]?)/;

function prefixFor(kind: BlockKind, index: number): string {
  switch (kind) {
    case 'heading1':
      return '# ';
    case 'heading2':
      return '## ';
    case 'heading3':
      return '### ';
    case 'bullet':
      return '- ';
    case 'numbered':
      return `${index + 1}. `;
    case 'check':
      return '- [ ] ';
    case 'quote':
      return '> ';
  }
}

function kindOfLine(line: string): BlockKind | undefined {
  const match = BLOCK_PREFIX.exec(line)?.[0];
  if (match === undefined) return undefined;
  if (match.startsWith('#')) {
    const level = match.trim().length;
    return level === 1 ? 'heading1' : level === 2 ? 'heading2' : level === 3 ? 'heading3' : undefined;
  }
  if (match.startsWith('>')) return 'quote';
  if (/\[[ xX]\]/.test(match)) return 'check';
  if (/^\d/.test(match)) return 'numbered';
  return 'bullet';
}

/**
 * Line-level formats (headings, lists, checklist, quote) for every line the selection touches.
 * The line's current block prefix is replaced; applying the kind a line already has removes it
 * (back to 本文). Lines inside a fenced code block are left alone.
 */
export function applyBlock(source: string, rawSelection: Selection, kind: BlockKind | 'body'): FormatEdit {
  const selection = clamp(source, rawSelection);
  const lineStart = source.lastIndexOf('\n', selection.start - 1) + 1;
  const nextBreak = source.indexOf('\n', selection.end);
  const lineEnd = nextBreak === -1 ? source.length : nextBreak;
  const lines = source.slice(lineStart, lineEnd).split('\n');

  // Toggle off only when every line already has this kind.
  const target = kind === 'body' ? undefined : kind;
  const removing = target === undefined || lines.every((line) => kindOfLine(line) === target);

  let fenced = isInsideFence(source, lineStart);
  let delta = 0;
  let firstDelta = 0;
  const out = lines.map((line, index) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    const old = BLOCK_PREFIX.exec(line)?.[0] ?? '';
    const next = removing || target === undefined ? '' : prefixFor(target, index);
    const rest = line.slice(old.length);
    delta += next.length - old.length;
    if (index === 0) firstDelta = next.length - old.length;
    return next + rest;
  });

  const text = source.slice(0, lineStart) + out.join('\n') + source.slice(lineEnd);
  const start = Math.max(lineStart, selection.start + firstDelta);
  const end = Math.max(start, selection.end + delta);
  return { text, selection: { start, end } };
}

function isInsideFence(source: string, index: number): boolean {
  const before = source.slice(0, index).split('\n');
  return before.filter((line) => /^\s*```/.test(line)).length % 2 === 1;
}

/** Heading level of the line holding `cursor`: 0 = 本文, 1–3 = H1–H3, `undefined` = other (H4+ …). */
export function currentHeadingLevel(source: string, cursor: number): number | undefined {
  const at = Math.min(Math.max(cursor, 0), source.length);
  const start = source.lastIndexOf('\n', at - 1) + 1;
  const end = source.indexOf('\n', start);
  const line = source.slice(start, end === -1 ? source.length : end);
  const match = /^(#{1,6})[ \t]+/.exec(line);
  if (match) return match[1]!.length <= 3 ? match[1]!.length : undefined;
  return BLOCK_PREFIX.test(line) ? undefined : 0;
}

/** `[text](url)`: the selection becomes the label and the URL placeholder is selected for typing. */
export function insertLink(source: string, rawSelection: Selection, placeholder = 'https://'): FormatEdit {
  const { start, end } = clamp(source, rawSelection);
  const label = source.slice(start, end);
  const text = `${source.slice(0, start)}[${label}](${placeholder})${source.slice(end)}`;
  const urlStart = start + 1 + label.length + 2;
  return { text, selection: { start: urlStart, end: urlStart + placeholder.length } };
}

/** Block-level insert on its own lines (blank line before and after), replacing the selection. */
function insertBlock(
  source: string,
  rawSelection: Selection,
  block: string,
  caretInBlock: number,
): FormatEdit {
  const { start, end } = clamp(source, rawSelection);
  const head = source.slice(0, start);
  const tail = source.slice(end);
  const lead = head === '' || head.endsWith('\n\n') ? '' : head.endsWith('\n') ? '\n' : '\n\n';
  const trail = tail === '' ? '\n' : tail.startsWith('\n\n') ? '' : tail.startsWith('\n') ? '\n' : '\n\n';
  const text = head + lead + block + trail + tail;
  const caret = head.length + lead.length + caretInBlock;
  return { text, selection: { start: caret, end: caret } };
}

/** A fenced code block; selected text becomes its content. */
export function insertCodeBlock(source: string, rawSelection: Selection): FormatEdit {
  const { start, end } = clamp(source, rawSelection);
  const selected = source.slice(start, end);
  return insertBlock(source, rawSelection, `\`\`\`\n${selected}\n\`\`\``, 4 + selected.length);
}

/** `![alt](ref)` on its own paragraph. `ref` is a `note-image://` reference, never image data. */
export function insertImage(source: string, rawSelection: Selection, ref: string, alt = ''): FormatEdit {
  const block = `![${alt}](${ref})`;
  return insertBlock(source, { start: rawSelection.end, end: rawSelection.end }, block, block.length);
}
