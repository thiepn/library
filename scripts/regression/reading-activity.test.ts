import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareReadingRecency,
  deriveReadingLibraryState,
  deriveReadingLibraryStatus,
  hasReadingActivity,
  isExactReadingActivity,
  readingLibraryStatusRank,
} from '../../src/lib/reading-activity/model';
import type { ReadingActivityRecordV1 } from '../../src/lib/client/library-db';
import type { ReadingEntryState } from '../../src/lib/reader-entry/continuity';

const epub = (current: number, updatedAt = '2026-08-28T08:00:00.000Z'): ReadingEntryState => ({
  format: 'epub',
  href: '/read',
  current,
  furthest: current,
  updatedAt,
});

const pdf = (current: number, updatedAt = '2026-08-28T09:00:00.000Z'): ReadingEntryState => ({
  format: 'pdf',
  href: '/pdf',
  current,
  furthest: current,
  updatedAt,
  page: Math.max(1, Math.round(current * 100)),
  pageCount: 100,
});

const activity = (overrides: Partial<ReadingActivityRecordV1> = {}): ReadingActivityRecordV1 => ({
  schemaVersion: 1,
  workId: 'work-1',
  edition: 1,
  releaseVersion: '1.0.0',
  format: 'epub',
  source: 'hosted',
  openedAt: '2026-08-28T10:00:00.000Z',
  ...overrides,
});

test('ER6 activity identity is exact across work, edition, and release', () => {
  assert.equal(isExactReadingActivity(activity(), { workId: 'work-1', edition: 1, releaseVersion: '1.0.0' }), true);
  assert.equal(isExactReadingActivity(activity(), { workId: 'work-1', edition: 2, releaseVersion: '1.0.0' }), false);
  assert.equal(isExactReadingActivity(activity(), { workId: 'work-1', edition: 1, releaseVersion: '2.0.0' }), false);
});

test('ER6 activity-only open is recent without fabricating progress', () => {
  const state = deriveReadingLibraryState({ entries: [] }, activity());
  assert.equal(state.status, 'not-started');
  assert.equal(state.lastFormat, 'epub');
  assert.equal(state.lastOpenedAt, '2026-08-28T10:00:00.000Z');
  assert.equal(state.lastActivityAt, '2026-08-28T10:00:00.000Z');
  assert.equal(hasReadingActivity(state), true);
  assert.equal(state.continuity.entries.length, 0);
});

test('ER6 in-progress format wins status over a completed alternate format', () => {
  const entries = [epub(1), pdf(0.42)];
  assert.equal(deriveReadingLibraryStatus(entries), 'in-progress');
  const state = deriveReadingLibraryState({ entries, primary: entries[1] }, activity({ format: 'pdf' }));
  assert.equal(state.status, 'in-progress');
});

test('ER6 completed status is format-neutral when no format remains in progress', () => {
  const entries = [epub(1), pdf(0)];
  assert.equal(deriveReadingLibraryStatus(entries), 'completed');
});

test('ER6 later progress activity can become the last-used format', () => {
  const entries = [epub(0.2, '2026-08-28T11:00:00.000Z'), pdf(0.3, '2026-08-28T09:00:00.000Z')];
  const state = deriveReadingLibraryState({ entries, primary: entries[0] }, activity({ format: 'pdf', openedAt: '2026-08-28T10:00:00.000Z' }));
  assert.equal(state.lastFormat, 'epub');
  assert.equal(state.lastActivityAt, '2026-08-28T11:00:00.000Z');
});

test('ER6 later explicit open becomes last-used format without translating positions', () => {
  const entries = [epub(0.2, '2026-08-28T08:00:00.000Z'), pdf(0.3, '2026-08-28T09:00:00.000Z')];
  const state = deriveReadingLibraryState({ entries, primary: entries[1] }, activity({ format: 'epub', openedAt: '2026-08-28T12:00:00.000Z' }));
  assert.equal(state.lastFormat, 'epub');
  assert.equal(state.continuity.entries[0]?.current, 0.2);
  assert.equal(state.continuity.entries[1]?.page, 30);
});

test('ER6 recency and library status ranking are deterministic', () => {
  const older = deriveReadingLibraryState({ entries: [epub(0.2, '2026-08-28T08:00:00.000Z')] });
  const newer = deriveReadingLibraryState({ entries: [pdf(0.2, '2026-08-28T09:00:00.000Z')] });
  assert.ok(compareReadingRecency(newer, older) < 0);
  assert.ok(readingLibraryStatusRank('in-progress') < readingLibraryStatusRank('not-started'));
  assert.ok(readingLibraryStatusRank('not-started') < readingLibraryStatusRank('completed'));
});
