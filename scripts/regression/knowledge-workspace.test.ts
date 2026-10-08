import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterKnowledgeWorkspace,
  knowledgeWorkspaceMarkdown,
  summarizeKnowledgeWorkspace,
  type KnowledgeWorkspaceItem,
} from '../../src/lib/knowledge/workspace';

function item(
  key: string,
  kind: KnowledgeWorkspaceItem['kind'],
  workId: string,
  title: string,
  updatedAt: string,
  overrides: Partial<KnowledgeWorkspaceItem> = {},
): KnowledgeWorkspaceItem {
  return {
    key,
    kind,
    format: 'epub',
    workId,
    title,
    location: 'Chapter 1',
    quote: kind === 'bookmark' ? '' : 'Selected passage',
    note: kind === 'note' ? 'Study insight' : '',
    createdAt: updatedAt,
    updatedAt,
    href: `/library/works/${workId}/read`,
    ...overrides,
  };
}

const ITEMS = [
  item('n1', 'note', 'book-a', 'Alpha', '2026-10-07T10:00:00.000Z'),
  item('h1', 'highlight', 'book-a', 'Alpha', '2026-10-06T10:00:00.000Z', { location: 'Chapter 2' }),
  item('b1', 'bookmark', 'book-b', 'Beta', '2026-10-08T10:00:00.000Z', { format: 'pdf', location: 'Page 12' }),
];

test('P6 Knowledge summary counts notes, highlights, bookmarks, and distinct books', () => {
  assert.deepEqual(summarizeKnowledgeWorkspace(ITEMS), {
    total: 3,
    notes: 1,
    highlights: 1,
    bookmarks: 1,
    books: 2,
  });
});

test('P6 Knowledge filtering composes query, type, format, and book filters', () => {
  assert.deepEqual(
    filterKnowledgeWorkspace(ITEMS, { query: 'study', kind: 'note' }).map((value) => value.key),
    ['n1'],
  );
  assert.deepEqual(
    filterKnowledgeWorkspace(ITEMS, { format: 'pdf', workId: 'book-b' }).map((value) => value.key),
    ['b1'],
  );
  assert.deepEqual(
    filterKnowledgeWorkspace(ITEMS, { workId: 'book-a', sort: 'oldest' }).map((value) => value.key),
    ['h1', 'n1'],
  );
});

test('P6 Knowledge markdown groups deterministically by book and preserves source links', () => {
  const markdown = knowledgeWorkspaceMarkdown(ITEMS, '2026-10-08T12:00:00.000Z');
  assert.match(markdown, /^# Library knowledge/);
  assert.ok(markdown.indexOf('## Alpha') < markdown.indexOf('## Beta'));
  assert.match(markdown, /### Chapter 1 · EPUB · Note/);
  assert.match(markdown, /> Selected passage/);
  assert.match(markdown, /Study insight/);
  assert.match(markdown, /### Page 12 · PDF · Bookmark/);
  assert.match(markdown, /\[Open in Library\]/);
});
