import {
  insertSnippet,
  parseInline,
  parseMarkdown,
  removeSegmentLine,
  splitEditorSegments,
  toggleChecklistLine,
  toggleLinePrefix,
} from './markdown';

describe('splitEditorSegments (editor shows images, not their Markdown)', () => {
  const image = '![画像](note-image://abc.png)';

  it('splits text around an image line and rebuilds the same body', () => {
    const body = `前\n\n${image}\n\n後`;
    const segments = splitEditorSegments(body);
    expect(segments.map((s) => s.type)).toEqual(['text', 'image', 'text']);
    expect(segments[1]).toMatchObject({ alt: '画像', ref: 'note-image://abc.png' });
    expect(segments.map((s) => body.slice(s.start, s.end)).join('\n')).toBe(body);
  });

  it('supports multiple images and a trailing editable segment', () => {
    const types = splitEditorSegments(`${image}\n\n![画像](note-image://def.jpg)\n`).map((s) => s.type);
    expect(types.filter((t) => t === 'image')).toHaveLength(2);
    expect(types[types.length - 1]).toBe('text');
  });

  it('keeps image-looking lines inside code fences as text', () => {
    const segments = splitEditorSegments(`\`\`\`\n${image}\n\`\`\``);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.type).toBe('text');
  });

  it('removes an image line without touching the rest', () => {
    const body = `前\n${image}\n後`;
    const seg = splitEditorSegments(body)[1];
    expect(seg && removeSegmentLine(body, seg.start, seg.end)).toBe('前\n後');
  });
});

describe('parseMarkdown', () => {
  it('parses headings, lists, checklists, quotes, links and code', () => {
    const blocks = parseMarkdown(
      ['## 見出し', '本文1', '本文2', '', '- a', '1. b', '- [ ] c', '- [x] d', '> q', '```', 'x', '```'].join(
        '\n',
      ),
    );
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'bullet',
      'numbered',
      'check',
      'check',
      'quote',
      'code',
    ]);
    expect(blocks[0]).toMatchObject({ level: 2 });
    expect(blocks[1]).toMatchObject({ inline: [{ type: 'text', text: '本文1\n本文2' }] });
    expect(blocks[4]).toMatchObject({ checked: false, line: 6 });
    expect(blocks[5]).toMatchObject({ checked: true, line: 7 });
    expect(blocks[7]).toEqual({ type: 'code', text: 'x' });
  });

  it('returns no blocks for an empty body and keeps an unclosed fence', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('```\nabc')).toEqual([{ type: 'code', text: 'abc' }]);
  });

  it('parses inline links, code and bold', () => {
    expect(parseInline('a [b](https://x.y) `c` **d** e')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'link', text: 'b', url: 'https://x.y' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'bold', text: 'd' },
      { type: 'text', text: ' e' },
    ]);
  });
});

describe('editing helpers', () => {
  it('toggles a checklist item without touching anything else', () => {
    const source = '- [ ] a\r\n- [x] b\n\ntext';
    expect(toggleChecklistLine(source, 0)).toBe('- [x] a\r\n- [x] b\n\ntext');
    expect(toggleChecklistLine(source, 1)).toBe('- [ ] a\r\n- [ ] b\n\ntext');
    expect(toggleChecklistLine(source, 9)).toBe(source);
  });

  it('adds and removes a line prefix at the cursor line', () => {
    expect(toggleLinePrefix('a\nb', 3, '## ')).toEqual({ text: 'a\n## b', cursor: 6 });
    expect(toggleLinePrefix('a\n## b', 6, '## ')).toEqual({ text: 'a\nb', cursor: 3 });
    expect(toggleLinePrefix('', 0, '- ')).toEqual({ text: '- ', cursor: 2 });
  });

  it('inserts a snippet at the cursor', () => {
    expect(insertSnippet('ab', 1, '``', 1)).toEqual({ text: 'a``b', cursor: 2 });
    expect(insertSnippet('ab', 99, 'x')).toEqual({ text: 'abx', cursor: 3 });
  });
});
