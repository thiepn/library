import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('saving a newly selected note closes annotations and returns focus to the book', async () => {
  const source = await readFile('src/lib/reader/annotations-harness.ts', 'utf8');

  assert.match(
    source,
    /state\.open && state\.message === 'Highlight and note saved\.'/,
    'successful new-note saves must be distinguished from ordinary annotation-panel updates',
  );
  assert.match(
    source,
    /annotations\.close\(false\);\s*base\.shell\.viewport\.focus\(\{ preventScroll: true \}\);/,
    'successful new-note saves must close the panel and restore reader focus',
  );
});
