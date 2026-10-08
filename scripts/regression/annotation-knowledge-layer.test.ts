import assert from 'node:assert/strict';
import test from 'node:test';
import { pdfReaderIdentityKey } from '../../src/lib/pdf-reader/canonical';
import { isPdfAnnotationRecord, type PdfAnnotationRecord } from '../../src/lib/pdf-reader/state';

const identity = {
  workId: 'work-1',
  edition: 2,
  releaseVersion: '2.0.0',
};

function record(): PdfAnnotationRecord {
  return {
    schemaVersion: 1,
    id: 'pdf-annotation:test',
    publicationKey: pdfReaderIdentityKey(identity),
    identity,
    page: 7,
    quote: 'A durable highlighted passage.',
    note: 'A study note.',
    rects: [
      { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
      { x: 0.1, y: 0.245, width: 0.22, height: 0.04 },
    ],
    createdAt: '2026-10-06T12:00:00.000Z',
    updatedAt: '2026-10-06T12:01:00.000Z',
  };
}

test('PDF annotation records preserve exact publication identity and normalized geometry', () => {
  const value = record();
  assert.equal(value.publicationKey, 'work-1::2::2.0.0');
  assert.equal(isPdfAnnotationRecord(value), true);
});

test('PDF annotations reject geometry outside the normalized page bounds', () => {
  const value = record();
  value.rects = [{ x: -0.01, y: 0.2, width: 0.3, height: 0.04 }];
  assert.equal(isPdfAnnotationRecord(value), false);
});

test('PDF annotations reject oversized quote and note payloads', () => {
  const quote = record();
  quote.quote = 'q'.repeat(2401);
  assert.equal(isPdfAnnotationRecord(quote), false);

  const note = record();
  note.note = 'n'.repeat(5001);
  assert.equal(isPdfAnnotationRecord(note), false);
});
