import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPausedReading,
  isRecentlyActive,
  rankPausedReading,
  readingActivityAgeDays,
  summarizeReadingIntelligence,
} from '../../src/lib/reading-activity/intelligence';
import type { ReadingLibraryState } from '../../src/lib/reading-activity/model';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');

function state(
  status: ReadingLibraryState['status'],
  lastActivityAt?: string,
  current = 0,
): ReadingLibraryState {
  return {
    status,
    continuity: current > 0
      ? {
          entries: [{
            format: 'epub',
            href: '/read',
            current,
            furthest: current,
            updatedAt: lastActivityAt ?? '2026-10-01T12:00:00.000Z',
          }],
          primary: {
            format: 'epub',
            href: '/read',
            current,
            furthest: current,
            updatedAt: lastActivityAt ?? '2026-10-01T12:00:00.000Z',
          },
        }
      : { entries: [] },
    ...(lastActivityAt ? { lastActivityAt, lastOpenedAt: lastActivityAt, lastFormat: 'epub' as const } : {}),
  };
}

test('P5 reading intelligence uses deterministic activity age windows', () => {
  const recent = state('in-progress', '2026-10-01T12:00:00.000Z', 0.25);
  assert.equal(readingActivityAgeDays(recent, NOW), 6);
  assert.equal(isRecentlyActive(recent, NOW, 30), true);
  assert.equal(isPausedReading(recent, NOW, 21), false);

  const paused = state('in-progress', '2026-09-01T12:00:00.000Z', 0.4);
  assert.equal(isRecentlyActive(paused, NOW, 30), false);
  assert.equal(isPausedReading(paused, NOW, 21), true);
});

test('P5 reading intelligence summary derives only from existing Library state', () => {
  const values = [
    state('in-progress', '2026-10-01T12:00:00.000Z', 0.2),
    state('in-progress', '2026-08-01T12:00:00.000Z', 0.7),
    state('completed', '2026-09-30T12:00:00.000Z', 1),
    state('not-started'),
  ];
  assert.deepEqual(summarizeReadingIntelligence(values, NOW, 30, 21), {
    total: 4,
    started: 3,
    inProgress: 2,
    completed: 1,
    savedForLater: 1,
    recentlyActive: 2,
    paused: 1,
  });
});

test('P5 paused resurfacing prefers the most recently paused book and caps results', () => {
  const candidates = [
    { value: 'old', state: state('in-progress', '2026-07-01T12:00:00.000Z', 0.8) },
    { value: 'newer', state: state('in-progress', '2026-09-01T12:00:00.000Z', 0.3) },
    { value: 'fresh', state: state('in-progress', '2026-10-01T12:00:00.000Z', 0.9) },
  ];
  assert.deepEqual(rankPausedReading(candidates, NOW, 1, 21).map(({ value }) => value), ['newer']);
});
