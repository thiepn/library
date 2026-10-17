import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPassageReference } from '../../src/lib/reader/passage-copy';

test('L2 passage citation contains an exact selected quote and human-readable EPUB location only', () => {
  const output = formatPassageReference({
    text: '  A passage   with   spaces  ',
    title: '  A  Sample   EPUB ',
    location: ' Chapter  4 ',
  });
  assert.equal(output, '“A passage with spaces”\n— A Sample EPUB, Chapter 4');
  assert.equal(output.includes('epubcfi('), false);
});

test('L2 PDF references retain their exact page context without leaking reader database identity', () => {
  const output = formatPassageReference({
    text: 'Relevant evidence.',
    title: 'Study PDF',
    location: 'PDF · page 7 of 40',
  });
  assert.equal(output, '“Relevant evidence.”\n— Study PDF, PDF · page 7 of 40');
  assert.equal(output.includes('pdf-annotation:'), false);
});

test('L2 quote copying declines empty selection and keeps an untitled fallback', () => {
  assert.throws(() => formatPassageReference({ text: ' ', title: 'Book', location: '' }), /Select a passage/);
  assert.equal(formatPassageReference({ text: 'Yes', title: ' ', location: '' }), '“Yes”\n— Untitled book');
});
