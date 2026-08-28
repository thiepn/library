import assert from 'node:assert/strict';
import test from 'node:test';
import { readerCanonicalCandidateFromPublication } from '../../src/lib/reader/canonical';
import type { ReaderPublicationCandidate } from '../../src/lib/reader/publication';

test('ER3 hosted publication adapter preserves exact source and release identity', () => {
  const publication: ReaderPublicationCandidate = {
    workId: 'work-123',
    slug: 'example',
    title: 'Example',
    language: 'en',
    edition: 3,
    version: '2026.08.28',
    epub: {
      format: 'epub',
      url: '/library/media/example.epub',
      bytes: 1234,
      sha256: 'a'.repeat(64),
    },
  };

  const candidate = readerCanonicalCandidateFromPublication(publication);
  assert.equal(candidate.source, publication.epub.url);
  assert.deepEqual(candidate.identity, {
    workId: 'work-123',
    edition: 3,
    releaseVersion: '2026.08.28',
  });
});

test('ER3 source candidate accepts browser-local ArrayBuffer without transforming bytes', () => {
  const source = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer;
  const candidate = {
    source,
    identity: {
      workId: 'personal:epub-abc',
      edition: 1,
      releaseVersion: `local-${'b'.repeat(64)}`,
    },
  };

  assert.equal(candidate.source, source);
  assert.equal(candidate.identity.workId, 'personal:epub-abc');
  assert.match(candidate.identity.releaseVersion, /^local-/);
});
