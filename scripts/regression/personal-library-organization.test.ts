import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAndSortPersonalBooks,
  parsePersonalOrganizationInput,
  personalLibraryFacets,
} from '../../src/lib/client/personal-library-organization';
import type { PersonalBookSummary } from '../../src/lib/client/personal-books';

const base = {
  schemaVersion: 1 as const,
  format: 'pdf' as const,
  fileName: 'book.pdf',
  mimeType: 'application/pdf',
  size: 100,
  sha256: 'a'.repeat(64),
  importedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

const books: PersonalBookSummary[] = [
  {
    ...base,
    id: 'pdf-a',
    title: 'Probability Notes',
    creator: 'Ada',
    shelves: ['Semester 3', 'Reference'],
    tags: ['stochastik', 'exam'],
  },
  {
    ...base,
    id: 'pdf-b',
    title: 'Analysis Archive',
    creator: 'Bernhard',
    size: 500,
    sha256: 'b'.repeat(64),
    importedAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    shelves: ['Archive'],
    tags: ['analysis'],
  },
];

test('organization input trims, de-duplicates, and preserves user-facing labels', () => {
  assert.deepEqual(
    parsePersonalOrganizationInput(' Reference, semester 3, reference ', ' Exam, exam, Stochastik '),
    {
      shelves: ['Reference', 'semester 3'],
      tags: ['Exam', 'Stochastik'],
    },
  );
});

test('personal library filters search across metadata, shelves, and tags', () => {
  assert.deepEqual(
    filterAndSortPersonalBooks(books, {
      query: 'stochastik',
      format: 'all',
      shelf: '',
      tag: '',
      sort: 'title',
    }).map((book) => book.id),
    ['pdf-a'],
  );
  assert.deepEqual(
    filterAndSortPersonalBooks(books, {
      query: '',
      format: 'pdf',
      shelf: 'semester 3',
      tag: 'EXAM',
      sort: 'title',
    }).map((book) => book.id),
    ['pdf-a'],
  );
});

test('facets are unique and sorted while sort modes remain deterministic', () => {
  assert.deepEqual(personalLibraryFacets(books), {
    shelves: ['Archive', 'Reference', 'Semester 3'],
    tags: ['analysis', 'exam', 'stochastik'],
  });
  assert.deepEqual(
    filterAndSortPersonalBooks(books, {
      query: '',
      format: 'all',
      shelf: '',
      tag: '',
      sort: 'size',
    }).map((book) => book.id),
    ['pdf-b', 'pdf-a'],
  );
});
