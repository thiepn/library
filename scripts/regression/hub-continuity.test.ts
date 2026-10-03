import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConsent, project, continuation, validBook, type Book } from '../../src/lib/hub/contract';
import { personalMetadata } from '../../src/lib/hub/storage';
const now = Date.parse('2026-10-04T00:00:00.000Z');
const book: Book = { workId: 'fictional', title: '<A fictional title>', format: 'epub', edition: 2, releaseVersion: 'r2', slug: 'fictional' };
const row = { schemaVersion: 2, workId: 'fictional', edition: 2, releaseVersion: 'r2', percentage: .2, furthestPercentage: .8, updatedAt: '2026-10-03T23:00:00.000Z', cfi: 'PRIVATE-CFI', chapterLabel: 'PRIVATE-CHAPTER', annotation: 'PRIVATE-NOTE' };
const grant = { schemaVersion: 1, deviceId: '11111111-1111-4111-8111-111111111111', revision: '22222222-2222-4222-8222-222222222222', permissions: ['summary'], includePersonal: false };
test('consent accepts explicit purpose and rejects missing, unknown, duplicate and malformed fields', () => {
  assert.deepEqual(parseConsent(grant), grant);
  for (const value of [null, {}, { ...grant, accountId: 'owner' }, { ...grant, permissions: ['summary','summary'] }, { ...grant, permissions: ['capture'] }, { ...grant, deviceId: 'not-a-device' }, { ...grant, includePersonal: 'true' }]) assert.equal(parseConsent(value), null);
});
test('backtracking keeps current and furthest distinct and exports exact metadata only', () => {
  const [item] = project([book], [row], [], 'continue', '', now);
  assert.equal(item?.current, .2); assert.equal(item?.furthest, .8);
  assert.deepEqual(Object.keys(item!).sort(), ['current','edition','format','furthest','releaseVersion','resourceId','title','updatedAt']);
  assert.ok(!JSON.stringify(item).includes('PRIVATE'));
});
test('stale edition/release and unversioned legacy progress are excluded', () => {
  for (const bad of [{ ...row, edition: 1 }, { ...row, releaseVersion: 'r1' }, { ...row, schemaVersion: 1 }]) assert.deepEqual(project([book], [bad], [], 'summary', '', now), []);
});
test('malformed, nonfinite and future progress does not masquerade as real progress', () => {
  for (const bad of [{ ...row, percentage: NaN }, { ...row, furthestPercentage: Infinity }, { ...row, percentage: -.1 }, { ...row, percentage: .9 }, { ...row, updatedAt: '2026-10-05T00:00:00.000Z' }, { ...row, updatedAt: 'bad' }]) assert.deepEqual(project([book], [bad], [], 'continue', '', now), []);
});
test('EPUB and PDF of one work have independent resource identities', () => {
  const pdf = { schemaVersion: 1, identity: { workId: 'fictional', edition: 2, releaseVersion: 'r2' }, page: 4, furthestPage: 8, pageCount: 10, updatedAt: row.updatedAt };
  const items = project([book, { ...book, format: 'pdf' }], [row], [pdf], 'summary', '', now);
  assert.equal(items.length, 2); assert.equal(items[1]?.current, .4); assert.equal(items[1]?.furthest, .8);
  for (const bad of [{ ...pdf, page: 0 }, { ...pdf, page: 4.5 }, { ...pdf, pageCount: 2 }, { ...pdf, identity: { ...pdf.identity, releaseVersion: 'r1' } }]) assert.deepEqual(project([{ ...book, format: 'pdf' }], [], [bad], 'continue', '', now), []);
});
test('search matches titles only, never chapter labels or annotations', () => {
  assert.equal(project([book], [row], [], 'search', 'FICTIONAL', now).length, 1);
  assert.equal(project([book], [row], [], 'search', 'PRIVATE', now).length, 0);
});
test('bounded recent results keep the newest records and stable format identities', () => {
  const books = Array.from({ length: 30 }, (_, i) => ({ ...book, workId: `fictional-${i}` }));
  const records = books.map(b => ({ ...row, workId: b.workId }));
  assert.equal(project(books, records, [], 'summary', '', now).length, 10);
  assert.equal(project(books, records, [], 'search', '', now).length, 20);
});
test('continuation rejects mismatched release and never accepts caller URLs', () => {
  assert.equal(continuation([book], 'fictional:epub', 2, 'r2'), '/library/read/fictional');
  assert.equal(continuation([book], 'fictional:epub', 1, 'r1'), null);
  assert.equal(continuation([{ ...book, slug: '../../elsewhere' }], 'fictional:epub', 2, 'r2'), null);
});
test('personal metadata has content-addressed identity without file or cover bytes', () => {
  const metadata = personalMetadata({ id: 'pdf-fictional', title: 'Personal fictional', format: 'pdf', sha256: 'a'.repeat(64) });
  assert.equal(continuation([metadata], `${metadata.workId}:pdf`, 1, metadata.releaseVersion), '/library/personal/pdf?id=pdf-fictional');
  assert.equal(metadata.releaseVersion, `local-${'a'.repeat(64)}`);
  assert.throws(() => personalMetadata({ id: 'bad', title: '\u0000private', format: 'epub', sha256: 'a'.repeat(64) }));
});
test('unsupported titles and identities fail closed', () => {
  for (const value of [{ ...book, title: '' }, { ...book, title: 'a'.repeat(161) }, { ...book, workId: '../book' }, { ...book, edition: 0 }]) assert.equal(validBook(value), false);
});
