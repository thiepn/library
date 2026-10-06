import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const hostedEpub = await readFile('src/pages/works/[slug]/read/index.astro', 'utf8');
const personalEpub = await readFile('src/pages/personal/read.astro', 'utf8');
const pdfRuntime = await readFile('src/lib/pdf-reader/runtime.ts', 'utf8');
const center = await readFile('src/pages/annotations.astro', 'utf8');

test('hosted EPUB annotation deep links restore only an exact release CFI', () => {
  assert.match(hostedEpub, /getReaderAnnotationById/);
  assert.match(hostedEpub, /annotation\.workId === publication\.workId/);
  assert.match(hostedEpub, /annotation\.edition === publication\.edition/);
  assert.match(hostedEpub, /annotation\.releaseVersion === publication\.version/);
  assert.match(hostedEpub, /target = annotation\.cfiRange/);
  assert.match(hostedEpub, /mountReaderPublicationWithFallbackHarness\(root, publication, \{\}, target\)/);
});

test('personal EPUB annotation deep links preserve the local content identity', () => {
  assert.match(personalEpub, /getReaderAnnotationById/);
  assert.match(personalEpub, /annotation\.workId === identity\.workId/);
  assert.match(personalEpub, /annotation\.edition === identity\.edition/);
  assert.match(personalEpub, /annotation\.releaseVersion === identity\.releaseVersion/);
  assert.match(personalEpub, /mountReaderSourceWithFallbackHarness[\s\S]*\{\}, target\)/);
});

test('PDF annotation links restore by annotation identity or explicit page', () => {
  assert.match(pdfRuntime, /searchParams\.get\('annotation'\)/);
  assert.match(pdfRuntime, /searchParams\.get\('page'\)/);
  assert.match(pdfRuntime, /linkedAnnotation\.page/);
  assert.match(center, /page=\$\{record\.page\}&annotation=/);
});

test('annotation center emits source-aware links for hosted and personal readers', () => {
  assert.match(center, /\/personal\/read\?id=/);
  assert.match(center, /\/works\/\$\{encodeURIComponent\(slug\)\}\/read\?annotation=/);
  assert.match(center, /\/personal\/pdf\?id=/);
  assert.match(center, /\/works\/\$\{encodeURIComponent\(slug\)\}\/pdf\?/);
});
