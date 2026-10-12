import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { bookNoteToMarkdown, isBookNoteDocumentV1, normalizedChapterKey } from '../../src/lib/knowledge/note-model';

test('N1A note schema accepts durable overview, chapter and reading documents', () => {
  const record = {
    schemaVersion: 1, id: 'sample-id', workId: 'pd-pg-84',
    scope: 'book-overview', title: 'Book overview', bodyMarkdown: 'A **test**',
    scopeKey: 'overview', sourceAnnotations: [], createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z', revision: 1,
  } as const;
  assert.equal(isBookNoteDocumentV1(record), true);
  assert.match(bookNoteToMarkdown(record), /A \*\*test\*\*/);
  assert.equal(isBookNoteDocumentV1({ ...record, bodyMarkdown: 'a'.repeat(250001) }), false);
  assert.equal(isBookNoteDocumentV1({ ...record, revision: 0 }), false);
  assert.equal(isBookNoteDocumentV1({ ...record, scope: 'chapter-summary', chapterKey: '2', scopeKey: 'chapter:2' }), true);
  assert.equal(isBookNoteDocumentV1({ ...record, scope: 'reading-note', scopeKey: undefined }), true);
  assert.equal(normalizedChapterKey('  CHAPTER   2  '), 'chapter 2');
});
