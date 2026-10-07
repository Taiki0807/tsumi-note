import { parseInline, parseMarkdown } from './markdown';
import {
  applyBlock,
  currentHeadingLevel,
  insertCodeBlock,
  insertImage,
  insertLink,
  toggleInline,
} from './markdown-format';

const sel = (start: number, end = start) => ({ start, end });

describe('toggleInline (selection → Markdown)', () => {
  it('wraps the selected text in bold: 重要です → **重要です**', () => {
    const result = toggleInline('これは重要ですね', sel(3, 7), '**');
    expect(result.text).toBe('これは**重要です**ね');
    expect(result.selection).toEqual(sel(5, 9));
  });

  it('applies italic and strikethrough', () => {
    expect(toggleInline('abc', sel(0, 3), '*').text).toBe('*abc*');
    expect(toggleInline('abc', sel(0, 3), '~~').text).toBe('~~abc~~');
    expect(toggleInline('abc', sel(0, 3), '`').text).toBe('`abc`');
  });

  it('unwraps when the text between the markers is selected', () => {
    const result = toggleInline('a **bc** d', sel(4, 6), '**');
    expect(result.text).toBe('a bc d');
    expect(result.selection).toEqual(sel(2, 4));
  });

  it('unwraps when the markers are part of the selection', () => {
    expect(toggleInline('a **bc** d', sel(2, 8), '**').text).toBe('a bc d');
    expect(toggleInline('~~x~~', sel(0, 5), '~~').text).toBe('x');
  });

  it('inserts an empty pair at a cursor and removes it again', () => {
    const inserted = toggleInline('ab', sel(1), '**');
    expect(inserted.text).toBe('a****b');
    expect(inserted.selection).toEqual(sel(3));
    expect(toggleInline(inserted.text, inserted.selection, '**').text).toBe('ab');
  });

  it('keeps bold and italic apart', () => {
    // italic on bold text adds a pair instead of eating half of the bold markers
    expect(toggleInline('**ab**', sel(2, 4), '*').text).toBe('***ab***');
    // removing italic from bold+italic leaves the bold
    expect(toggleInline('***ab***', sel(3, 5), '*').text).toBe('**ab**');
    expect(toggleInline('***ab***', sel(3, 5), '**').text).toBe('*ab*');
  });

  it('round-trips through the parser', () => {
    expect(parseInline('**a** *b* ~~c~~')).toEqual([
      { type: 'styled', text: 'a', bold: true, italic: false, strike: false },
      { type: 'text', text: ' ' },
      { type: 'styled', text: 'b', bold: false, italic: true, strike: false },
      { type: 'text', text: ' ' },
      { type: 'styled', text: 'c', bold: false, italic: false, strike: true },
    ]);
  });

  it('previews toolbar output for Italic → Bold and Bold → Italic as bold + italic', () => {
    const both = [{ type: 'styled', text: 'text', bold: true, italic: true, strike: false }];
    const italicFirst = toggleInline(toggleInline('text', sel(0, 4), '*').text, sel(1, 5), '**');
    expect(italicFirst.text).toBe('***text***');
    expect(parseInline(italicFirst.text)).toEqual(both);

    const boldFirst = toggleInline(toggleInline('text', sel(0, 4), '**').text, sel(2, 6), '*');
    expect(boldFirst.text).toBe('***text***');
    expect(parseInline(boldFirst.text)).toEqual(both);
  });
});

describe('applyBlock', () => {
  it('sets H1 / H2 / H3 on the cursor line and saves it as # / ## / ###', () => {
    expect(applyBlock('見出し', sel(0), 'heading1').text).toBe('# 見出し');
    expect(applyBlock('見出し', sel(0), 'heading2').text).toBe('## 見出し');
    expect(applyBlock('a\n見出し', sel(4), 'heading3').text).toBe('a\n### 見出し');
  });

  it('switches between heading levels and back to 本文', () => {
    expect(applyBlock('# 見出し', sel(3), 'heading2').text).toBe('## 見出し');
    expect(applyBlock('## 見出し', sel(3), 'heading2').text).toBe('見出し');
    expect(applyBlock('### 見出し', sel(3), 'body').text).toBe('見出し');
  });

  it('formats lists, checklist and quote and toggles them off', () => {
    expect(applyBlock('a', sel(0), 'bullet').text).toBe('- a');
    expect(applyBlock('a', sel(0), 'numbered').text).toBe('1. a');
    expect(applyBlock('a', sel(0), 'check').text).toBe('- [ ] a');
    expect(applyBlock('a', sel(0), 'quote').text).toBe('> a');
    expect(applyBlock('- a', sel(2), 'bullet').text).toBe('a');
    expect(applyBlock('- [x] a', sel(2), 'check').text).toBe('a');
    expect(applyBlock('- a', sel(2), 'check').text).toBe('- [ ] a');
  });

  it('applies to every selected line and numbers lists', () => {
    const result = applyBlock('a\nb\nc', sel(0, 5), 'numbered');
    expect(result.text).toBe('1. a\n2. b\n3. c');
    expect(applyBlock(result.text, result.selection, 'numbered').text).toBe('a\nb\nc');
  });

  it('does not touch lines inside a code block', () => {
    expect(applyBlock('```\nx\n```', sel(0, 9), 'bullet').text).toBe('```\nx\n```');
  });

  it('reports the heading level at the cursor', () => {
    expect(currentHeadingLevel('## a', 1)).toBe(2);
    expect(currentHeadingLevel('a\n# b', 4)).toBe(1);
    expect(currentHeadingLevel('plain', 0)).toBe(0);
    expect(currentHeadingLevel('- a', 0)).toBeUndefined();
  });
});

describe('insertLink / insertCodeBlock / insertImage', () => {
  it('turns the selection into a link label and selects the URL', () => {
    const result = insertLink('see docs', sel(4, 8));
    expect(result.text).toBe('see [docs](https://)');
    expect(result.text.slice(result.selection.start, result.selection.end)).toBe('https://');
    expect(insertLink('', sel(0)).text).toBe('[](https://)');
  });

  it('inserts a fenced code block around the selection', () => {
    expect(insertCodeBlock('', sel(0)).text).toBe('```\n\n```\n');
    const result = insertCodeBlock('a\nconst x\nb', sel(2, 9));
    expect(result.text).toBe('a\n\n```\nconst x\n```\n\nb');
    expect(parseMarkdown(result.text).map((b) => b.type)).toEqual(['paragraph', 'code', 'paragraph']);
  });

  it('inserts an image reference as its own block', () => {
    const result = insertImage('前\n後', sel(1), 'note-image://a.jpg', '画像');
    expect(result.text).toBe('前\n\n![画像](note-image://a.jpg)\n\n後');
    expect(parseMarkdown(result.text)).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: '前' }] },
      { type: 'image', alt: '画像', ref: 'note-image://a.jpg' },
      { type: 'paragraph', inline: [{ type: 'text', text: '後' }] },
    ]);
    expect(insertImage('', sel(0), 'note-image://a.jpg').text).toBe('![](note-image://a.jpg)\n');
  });
});
