import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResolvedWork } from '../../src/lib/content/repository';
import { describeReaderFailure } from '../../src/lib/reader/fallback';
import {
  localizeReaderArtifact,
  localizeReaderPublication,
  readerCanOpen,
  resolveReaderMigration,
} from '../../src/lib/reader/migration';
import type { ReaderPublicationArtifact, ReaderPublicationCandidate } from '../../src/lib/reader/publication';
import { ReaderEngineError } from '../../src/lib/reader/types';

const SHA = 'a'.repeat(64);

function epubArtifact(url = 'https://thiepn.dev/library/media/synthetic/1.2.3/book.epub'): ReaderPublicationArtifact {
  return {
    url,
    sizeBytes: 1024,
    sha256: SHA,
    filename: 'book.epub',
    mimeType: 'application/epub+zip',
  };
}

function pdfArtifact(url = 'https://thiepn.dev/library/media/synthetic/1.2.3/book.pdf'): ReaderPublicationArtifact {
  return {
    url,
    sizeBytes: 2048,
    sha256: 'b'.repeat(64),
    filename: 'book.pdf',
    mimeType: 'application/pdf',
  };
}

function syntheticWork(options: { epub?: boolean; webMaterialized?: boolean } = {}): ResolvedWork {
  const hasEpub = options.epub ?? false;
  return {
    id: 'synthetic-regression-work',
    slug: 'synthetic-regression-work',
    title: 'Synthetic Regression Work',
    subtitle: 'A deterministic fixture',
    language: 'en',
    webMaterialized: options.webMaterialized ?? false,
    release: hasEpub ? {
      schemaVersion: 1,
      workId: 'synthetic-regression-work',
      version: '1.2.3',
      edition: 4,
      releasedAt: '2026-01-01',
      artifacts: { epub: epubArtifact(), pdf: pdfArtifact() },
    } : undefined,
  } as unknown as ResolvedWork;
}

test('eligible active EPUB release wins over materialized legacy Markdown', () => {
  const decision = resolveReaderMigration(syntheticWork({ epub: true, webMaterialized: true }));
  assert.equal(decision.mode, 'native-epub');
  assert.equal(decision.reason, 'active-epub-release');
  assert.equal(decision.publication?.workId, 'synthetic-regression-work');
  assert.equal(decision.publication?.edition, 4);
  assert.equal(decision.publication?.version, '1.2.3');
  assert.equal(readerCanOpen(syntheticWork({ epub: true, webMaterialized: true })), true);
});

test('materialized Markdown remains first-class when no eligible EPUB exists', () => {
  const decision = resolveReaderMigration(syntheticWork({ webMaterialized: true }));
  assert.deepEqual(decision, { mode: 'legacy-web', reason: 'legacy-web-materialized' });
  assert.equal(readerCanOpen(syntheticWork({ webMaterialized: true })), true);
});

test('work without EPUB or materialized Markdown is explicitly unavailable', () => {
  const decision = resolveReaderMigration(syntheticWork());
  assert.deepEqual(decision, { mode: 'unavailable', reason: 'no-readable-publication' });
  assert.equal(readerCanOpen(syntheticWork()), false);
});

test('canonical production publication artifacts localize to the active Library base', () => {
  const publication: ReaderPublicationCandidate = {
    workId: 'synthetic-regression-work',
    slug: 'synthetic-regression-work',
    title: 'Synthetic Regression Work',
    language: 'en',
    edition: 4,
    version: '1.2.3',
    epub: epubArtifact(),
    pdf: pdfArtifact(),
  };
  const localized = localizeReaderPublication(publication, '/library/');
  assert.equal(localized.epub.url, '/library/media/synthetic/1.2.3/book.epub');
  assert.equal(localized.pdf?.url, '/library/media/synthetic/1.2.3/book.pdf');
  assert.equal(localized.version, publication.version);
  assert.equal(localized.edition, publication.edition);
});

test('noncanonical artifact origins remain release-authoritative and unchanged', () => {
  const external = epubArtifact('https://example.invalid/releases/book.epub');
  assert.strictEqual(localizeReaderArtifact(external, '/library'), external);
});

test('network-like errors receive network recovery even when nested under engine errors', () => {
  const error = new ReaderEngineError('epub-open-failed', 'Unable to open', new Error('Failed to fetch publication'));
  const failure = describeReaderFailure(error);
  assert.equal(failure.kind, 'network');
  assert.equal(failure.retryable, true);
  assert.equal(failure.code, 'epub-open-failed');
});

test('publication, rendering, location, and reader failures remain separately classified', () => {
  assert.equal(describeReaderFailure(new ReaderEngineError('epub-open-failed', 'broken')).kind, 'publication');
  assert.equal(describeReaderFailure(new ReaderEngineError('epub-render-failed', 'broken')).kind, 'rendering');
  assert.equal(describeReaderFailure(new ReaderEngineError('invalid-location', 'broken')).kind, 'location');
  assert.equal(describeReaderFailure(new ReaderEngineError('engine-not-ready', 'broken')).kind, 'reader');
});

test('invalid container remains a non-retryable reader initialization failure', () => {
  const failure = describeReaderFailure(new ReaderEngineError('invalid-container', 'missing container'));
  assert.equal(failure.kind, 'reader');
  assert.equal(failure.retryable, false);
});

test('unknown failures degrade to the stable generic recovery contract', () => {
  const failure = describeReaderFailure(new Error('synthetic unexplained failure'));
  assert.equal(failure.kind, 'unknown');
  assert.equal(failure.retryable, true);
  assert.match(failure.heading, /reader/i);
});
