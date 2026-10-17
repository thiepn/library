import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OTHER_SUBJECT,
  isReaderFacingSubject,
  searchableText,
  visibleBrowseBooks,
  type BrowseBook,
  type BrowseFilters,
} from '../../src/lib/content/browse';

const books: BrowseBook[] = [
  { id: 'b', title: 'Étude Française', author: 'Zoé', language: 'fr', subjects: ['language-learning'], formats: ['epub'], searchText: 'Étude Française Zoé language', updatedAt: '2026-08-02' },
  { id: 'c', title: 'Theology', author: 'Adams', language: 'en', subjects: ['bv'], formats: ['pdf'], searchText: 'Theology Adams Bible', updatedAt: '2026-09-09' },
  { id: 'a', title: 'Ancient History', author: 'Brown', language: 'en', subjects: ['history'], formats: ['epub', 'pdf', 'web'], searchText: 'Ancient History Brown', updatedAt: '2026-01-01' },
];
const defaults: BrowseFilters = { query: '', language: '', subject: '', format: '', sort: 'recent' };

test('L1 browse preserves source IDs and does not mutate the authored catalog', () => {
  const ids = books.map((book) => book.id);
  assert.deepEqual(visibleBrowseBooks(books, defaults).map((book) => book.id), ['c', 'b', 'a']);
  assert.deepEqual(books.map((book) => book.id), ids);
});

test('L1 browse searches without changing diacritics or reading data', () => {
  assert.equal(searchableText('  Étude   FRANÇAISE '), 'etude francaise');
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, query: 'etude' }).map((book) => book.id), ['b']);
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, query: 'bible' }).map((book) => book.id), ['c']);
});

test('L1 browse filters by actual language, subject, and available format', () => {
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, language: 'fr', format: 'epub' }).map((book) => book.id), ['b']);
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, subject: 'history', format: 'pdf' }).map((book) => book.id), ['a']);
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, subject: 'history', format: 'web' }).map((book) => book.id), ['a']);
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, language: 'fr', format: 'pdf' }), []);
});

test('L1 browse keeps opaque abbreviated source classifications intact without inventing category names', () => {
  assert.equal(isReaderFacingSubject('bv'), false);
  assert.equal(isReaderFacingSubject('language-learning'), true);
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, subject: OTHER_SUBJECT }).map((book) => book.id), ['c']);
  assert.equal(books[1].subjects[0], 'bv');
});

test('L1 browse provides deterministic title and author ordering', () => {
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, sort: 'title' }).map((book) => book.id), ['a', 'b', 'c']);
  assert.deepEqual(visibleBrowseBooks(books, { ...defaults, sort: 'author' }).map((book) => book.id), ['c', 'a', 'b']);
});

test('L1 browse handles unknown or invalid update dates without comparator exceptions', () => {
  const unknown = books.map((book) => ({ ...book, updatedAt: 'unknown' }));
  assert.equal(visibleBrowseBooks(unknown, defaults).length, 3);
});
