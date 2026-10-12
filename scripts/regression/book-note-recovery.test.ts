import test from 'node:test';
import assert from 'node:assert/strict';
import { notebookRecoveryMarkdown } from '../../src/lib/knowledge/note-recovery';

test('N1D manual recovery keeps exact unsaved Markdown and EPUB location without a cloud write', () => {
  const bodyMarkdown = '# Thinking\n\n- A **new** insight\n- 中文 / 한국어\n\n' + 'Line\n'.repeat(3);
  const anchor = {
    format: 'epub' as const, edition: 1, releaseVersion: 'r1',
    chapterHref: 'chapter-5.xhtml', chapterLabel: 'Chapter 5',
    cfi: 'epubcfi(/6/10!/4/2:20)',
  };
  const text = notebookRecoveryMarkdown({
    workId: 'book-01', scope: 'reading-note', id: 'note-01',
    title: 'My\nupdated "note"', bodyMarkdown, anchor,
  });
  assert.match(text, /thiepn_recovery_draft: true/);
  assert.match(text, /thiepn_note_id: "note-01"/);
  assert.match(text, /thiepn_book_id: "book-01"/);
  assert.match(text, /epubcfi/);
  assert.match(text, /chapter-5\.xhtml/);
  assert.equal(text.endsWith(bodyMarkdown + '\n'), true);
  assert.equal(text.includes('thiepn_source_anchor_json:'), true);
});

test('N1D manual recovery preserves PDF page and web chapter anchors without inventing CFI', () => {
  const anchors = [
    { format: 'pdf' as const, edition: 2, releaseVersion: 'v2', page: 19 },
    { format: 'web' as const, chapterId: 'preface' },
  ];
  for (const anchor of anchors) {
    const text = notebookRecoveryMarkdown({
      workId: 'sample', scope: 'chapter-summary', title: 'Summary',
      bodyMarkdown: 'Keep this draft.', anchor,
    });
    assert.match(text, /thiepn_source_anchor_json:/);
    assert.equal(text.includes('epubcfi('), false);
    assert.ok(text.includes(JSON.stringify(anchor).replaceAll('"', '\\"')));
  }
});
