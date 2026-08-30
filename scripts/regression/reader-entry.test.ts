import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choosePrimaryReadingEntry,
  createReadingContinuitySnapshot,
  readingActionLabel,
  readingPositionLabel,
  type ReadingEntryState,
} from '../../src/lib/reader-entry/continuity';

const epub = (overrides: Partial<ReadingEntryState> = {}): ReadingEntryState => ({
  format: 'epub',
  href: '/library/works/example/read',
  current: 0,
  furthest: 0,
  ...overrides,
});

const pdf = (overrides: Partial<ReadingEntryState> = {}): ReadingEntryState => ({
  format: 'pdf',
  href: '/library/works/example/pdf',
  current: 0,
  furthest: 0,
  ...overrides,
});

const web = (overrides: Partial<ReadingEntryState> = {}): ReadingEntryState => ({
  format: 'web',
  href: '/library/works/example/read',
  current: 0,
  furthest: 0,
  ...overrides,
});

test('ER5 starts a new multi-format book in EPUB without fabricating PDF progress', () => {
  const primary = choosePrimaryReadingEntry([pdf(), epub()]);
  assert.equal(primary?.format, 'epub');
  assert.equal(primary?.current, 0);
  assert.equal(readingActionLabel(primary), 'Start reading');
});

test('ER5 keeps EPUB as the canonical general entry even when PDF was used more recently', () => {
  const primary = choosePrimaryReadingEntry([
    epub({ current: .42, furthest: .61, updatedAt: '2026-08-27T10:00:00Z' }),
    pdf({ current: .25, furthest: .30, updatedAt: '2026-08-28T10:00:00Z', page: 25, pageCount: 100 }),
  ]);
  assert.equal(primary?.format, 'epub');
  assert.equal(primary?.current, .42);
  assert.equal(readingActionLabel(primary), 'Continue reading');
});

test('ER5 falls back to the most recently used in-progress format when EPUB is unavailable', () => {
  const primary = choosePrimaryReadingEntry([
    web({ current: .20, furthest: .28, updatedAt: '2026-08-27T10:00:00Z' }),
    pdf({ current: .25, furthest: .30, updatedAt: '2026-08-28T10:00:00Z', page: 25, pageCount: 100 }),
  ]);
  assert.equal(primary?.format, 'pdf');
  assert.equal(primary?.current, .25);
});

test('ER5 prefers EPUB even when an alternate format is completed more recently', () => {
  const primary = choosePrimaryReadingEntry([
    epub({ current: .55, furthest: .70, updatedAt: '2026-08-20T10:00:00Z' }),
    pdf({ current: 1, furthest: 1, updatedAt: '2026-08-28T10:00:00Z', page: 100, pageCount: 100 }),
  ]);
  assert.equal(primary?.format, 'epub');
  assert.equal(readingActionLabel(primary), 'Continue reading');
});

test('ER5 continuity snapshot preserves independent format positions', () => {
  const snapshot = createReadingContinuitySnapshot([
    epub({ current: .33, furthest: .48, chapterLabel: 'Chapter 4' }),
    pdf({ current: .12, furthest: .19, page: 12, pageCount: 100 }),
  ]);
  assert.equal(snapshot.entries[0]?.current, .33);
  assert.equal(snapshot.entries[0]?.furthest, .48);
  assert.equal(snapshot.entries[1]?.current, .12);
  assert.equal(snapshot.entries[1]?.furthest, .19);
  assert.equal(snapshot.entries[1]?.page, 12);
});

test('ER5 PDF position labels remain page-based instead of pretending to be EPUB locations', () => {
  const entry = pdf({ current: .12, furthest: .19, page: 12, pageCount: 100 });
  assert.equal(readingPositionLabel(entry), 'PDF · page 12 of 100');
});
