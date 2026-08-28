import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pdfCanonicalCandidateFromHosted,
  pdfReaderIdentityKey,
  type PdfCanonicalCandidate,
} from '../../src/lib/pdf-reader/canonical';

test('ER4 hosted PDF adapter preserves exact source and release identity', () => {
  const candidate = pdfCanonicalCandidateFromHosted({
    workId: 'work-123',
    edition: 4,
    releaseVersion: '2026.08.28',
    url: '/library/media/example.pdf',
    title: 'Example',
    language: 'en',
    fallbackUrl: '/library/media/example.pdf',
    backHref: '/library/works/example',
  });

  assert.equal(candidate.source, '/library/media/example.pdf');
  assert.deepEqual(candidate.identity, {
    workId: 'work-123',
    edition: 4,
    releaseVersion: '2026.08.28',
  });
  assert.equal(candidate.fallbackUrl, '/library/media/example.pdf');
});

test('ER4 personal PDF source accepts an ArrayBuffer without changing source identity', () => {
  const source = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
  const candidate: PdfCanonicalCandidate = {
    source,
    identity: {
      workId: 'personal:pdf-abc',
      edition: 1,
      releaseVersion: `local-${'b'.repeat(64)}`,
    },
    title: 'Personal PDF',
  };

  assert.equal(candidate.source, source);
  assert.equal(candidate.identity.edition, 1);
  assert.match(candidate.identity.releaseVersion, /^local-/);
});

test('ER4 state keys isolate editions and release versions of the same work', () => {
  const a = pdfReaderIdentityKey({ workId: 'same-work', edition: 1, releaseVersion: '1.0.0' });
  const b = pdfReaderIdentityKey({ workId: 'same-work', edition: 2, releaseVersion: '1.0.0' });
  const c = pdfReaderIdentityKey({ workId: 'same-work', edition: 1, releaseVersion: '1.0.1' });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(b, c);
});
