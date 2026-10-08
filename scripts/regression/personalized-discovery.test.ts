import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rankPersonalizedDiscovery,
  type PersonalizedDiscoveryItem,
} from '../../src/lib/content/personalized-discovery';
import type { DiscoveryWork } from '../../src/lib/content/discovery';
import type { ReadingLibraryState } from '../../src/lib/reading-activity/model';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');

function work(id: string, subjects: string[] = []): DiscoveryWork {
  return {
    id,
    slug: id,
    title: id,
    language: 'en-US',
    contributors: [{ name: 'Author A', role: 'author' }],
    classification: { subjects, tags: [], collections: [] },
    relationships: { relatedWorks: [], prerequisites: [] },
  };
}

function state(
  status: ReadingLibraryState['status'],
  lastActivityAt?: string,
): ReadingLibraryState {
  return {
    status,
    continuity: { entries: [] },
    ...(lastActivityAt ? { lastActivityAt, lastOpenedAt: lastActivityAt, lastFormat: 'epub' as const } : {}),
  };
}

function item(
  value: DiscoveryWork,
  reading: ReadingLibraryState,
  saved = false,
): PersonalizedDiscoveryItem<DiscoveryWork> {
  return { work: value, state: reading, saved };
}

test('P5 personalized discovery is hard-disabled without explicit opt-in', () => {
  const source = work('source', ['missions']);
  const candidate = work('candidate', ['missions']);
  const ranked = rankPersonalizedDiscovery([
    item(source, state('completed', '2026-10-01T12:00:00.000Z'), true),
    item(candidate, state('not-started')),
  ], false, NOW);
  assert.deepEqual(ranked, []);
});

test('P5 personalized discovery recommends only unsaved not-started hosted candidates', () => {
  const source = work('source', ['missions']);
  const candidate = work('candidate', ['missions']);
  const alreadySaved = work('saved', ['missions']);
  const finished = work('finished', ['missions']);
  const ranked = rankPersonalizedDiscovery([
    item(source, state('completed', '2026-10-01T12:00:00.000Z'), true),
    item(candidate, state('not-started')),
    item(alreadySaved, state('not-started'), true),
    item(finished, state('completed', '2026-10-02T12:00:00.000Z')),
  ], true, NOW);
  assert.deepEqual(ranked.map(({ work: value }) => value.id), ['candidate']);
});

test('P5 personalized discovery prefers relationships to more recently read sources', () => {
  const older = work('older', ['missions']);
  const recent = work('recent', ['economics']);
  const missionCandidate = work('mission-candidate', ['missions']);
  const economicsCandidate = work('economics-candidate', ['economics']);

  const ranked = rankPersonalizedDiscovery([
    item(older, state('completed', '2026-05-01T12:00:00.000Z'), true),
    item(recent, state('completed', '2026-10-01T12:00:00.000Z'), true),
    item(missionCandidate, state('not-started')),
    item(economicsCandidate, state('not-started')),
  ], true, NOW);

  assert.equal(ranked[0]?.work.id, 'economics-candidate');
  assert.ok(ranked[0]?.score > (ranked[1]?.score ?? 0));
});
