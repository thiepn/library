import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('saving a newly selected note closes annotations once and returns focus to the book', async () => {
  const source = await readFile('src/lib/reader/annotations-harness.ts', 'utf8');

  assert.match(
    source,
    /let annotationCount = annotations\.snapshot\.items\.length;/,
    'annotation coordination must remember the previous item count',
  );
  assert.match(
    source,
    /const annotationAdded = state\.items\.length > annotationCount;\s*annotationCount = state\.items\.length;/,
    'dismissal must be tied to the transition where a new annotation is actually added',
  );
  assert.match(
    source,
    /state\.open && annotationAdded && state\.message === 'Highlight and note saved\.'/,
    'successful new-note saves must be distinguished from later panel opens and ordinary updates',
  );
  assert.match(
    source,
    /annotations\.close\(false\);\s*base\.shell\.viewport\.focus\(\{ preventScroll: true \}\);/,
    'successful new-note saves must close the panel and restore reader focus',
  );
});
