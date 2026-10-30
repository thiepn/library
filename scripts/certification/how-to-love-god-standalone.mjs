// Dependency-free, read-only source verification for the How to Love God draft.
// This does NOT certify built readers or published media bytes.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = 'src/content/works/how-to-love-god';
const chapters = path.join(root, 'chapters');
const read = (file) => readFile(file, 'utf8');
const [filenames, manifestText, work, release] = await Promise.all([
  readdir(chapters),
  read(path.join(root, 'recovery/publication-expected.json')),
  read(path.join(root, 'work.yaml')),
  read('src/publications/releases/how-to-love-god/1.1.0.yaml'),
]);
const manifest = JSON.parse(manifestText);
const files = filenames.filter((file) => file.endsWith('.md')).sort();
assert.equal(manifest.workId, 'how-to-love-god');
assert.equal(manifest.release, '1.1.0');
assert.equal(files.length, 51, 'canonical reader section count');
assert.equal(files.length, manifest.expectedReaderFiles);
assert.equal(manifest.records.length, 51, 'recovery record count');
const expectedByFile = new Map(manifest.records.map((x) => [x.file, x]));
assert.equal(expectedByFile.size, 51, 'unique recovery record filenames');
const ids = new Set(), orders = new Set(), sources = [], calls = [], notes = [], backlinks = [], imageURLs = [];
const bodyCount = { numbered: 0, appendices: 0, openings: 0, front: 0, transition: 0 };
let historicHashDrifts = 0;
const normalize = (raw) => raw?.trim()?.replace(/^['"]|['"]$/g, '');
for (const filename of files) {
  const content = await read(path.join(chapters, filename));
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, 'YAML header exists for ' + filename);
  const field = (key) => normalize(match[1].match(new RegExp('^' + key + ':\\s*(.*?)\\s*$', 'm'))?.[1]);
  const id = field('id'), order = Number(field('order')), part = field('part'), status = field('status');
  assert.ok(id && Number.isInteger(order) && order > 0, 'valid section ID/order: ' + filename);
  assert.equal(status, 'published', 'section publish status: ' + filename);
  assert.ok(!ids.has(id) && !orders.has(order), 'duplicate section id/order: ' + filename);
  ids.add(id); orders.add(order);
  const record = expectedByFile.get(filename);
  assert.ok(record, 'recovery record exists: ' + filename);
  assert.equal(id, record.id, 'record id: ' + filename);
  assert.equal(order, record.order, 'record order: ' + filename);
  assert.equal(part === 'null' ? null : part, record.part, 'record part: ' + filename);
  const historical = createHash('sha256').update(content).digest('hex');
  if (record.sha256 !== historical) historicHashDrifts += 1; // expected on edited draft; NEVER overwrite released snapshot
  const body = content.slice(match[0].length);
  for (const m of body.matchAll(/id="ref-(\d+-\d+)"/g)) calls.push([m[1], filename]);
  for (const m of body.matchAll(/id="note-(\d+-\d+)"/g)) notes.push([m[1], filename]);
  for (const m of body.matchAll(/\]\(#ref-(\d+-\d+)\)/g)) backlinks.push([m[1], filename]);
  for (const m of body.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)) imageURLs.push(m[1]);
  for (const m of body.matchAll(/\bChapters?\s+(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?/g)) {
    const start = Number(m[1]), end = Number(m[2] || m[1]);
    assert.ok(start >= 1 && end <= 28 && start <= end, 'chapter reference ' + m[0] + ' in ' + filename);
  }
  for (const m of body.matchAll(/\bAppendix\s+([A-L])\b/g)) {
    assert.ok(m[1].length === 1, 'appendix reference in ' + filename);
  }
  if (/^\d{2}-part-/.test(filename)) bodyCount.openings++;
  else if (/^0[012]-(?:copyright|preface|introduction)/.test(filename)) bodyCount.front++;
  else if (/^6051-from-love-/.test(filename)) bodyCount.transition++;
  else if (/^\d{2}-/.test(filename)) bodyCount.numbered++;
  else if (/^[a-l]-/.test(filename)) bodyCount.appendices++;
  else throw Error('unclassified section: ' + filename);
  sources.push({ filename, id, order, part });
}
assert.deepEqual(bodyCount, { numbered: 28, appendices: 12, openings: 7, front: 3, transition: 1 }, 'section categories');
assert.deepEqual(sources.map(x => x.order).sort((a,b) => a-b), manifest.records.map(x => x.order).sort((a,b) => a-b), 'canonical order values match recovery record');
const unique = (arr) => new Set(arr.map(x => x[0]));
const refs = unique(calls), defs = unique(notes), returns = unique(backlinks);
assert.equal(calls.length, 20, 'source call count');
assert.equal(notes.length, 20, 'source definition count');
assert.equal(backlinks.length, 20, 'source return link count');
assert.equal(refs.size, 20); assert.equal(defs.size, 20); assert.equal(returns.size, 20);
assert.deepEqual([...refs].sort(), [...defs].sort(), 'note targets correspond to calls');
assert.deepEqual([...refs].sort(), [...returns].sort(), 'endnote return anchors correspond to calls');
assert.ok(notes.every(x => x[1] === 'l-sources-notes-and-further-reading.md'), 'note definitions are in Appendix L');
const [appendixC, appendixL] = await Promise.all([
  read(path.join(chapters, 'c-thirty-days-of-practicing-love-for-god.md')),
  read(path.join(chapters, 'l-sources-notes-and-further-reading.md')),
]);
const days = [...appendixC.matchAll(/\*\*Day (\d+) —/g)].map(m => Number(m[1]));
assert.deepEqual(days, Array.from({ length: 30 }, (_, i) => i + 1), 'day numbering 1–30');
assert.ok(appendixL.includes('Miller, Chris H., and Dawson W. Hedges.'), 'scrupulosity citation author names');
assert.ok(appendixL.includes('Büssing, Arndt, Lorethy Starck, and Klaus van Treeck.'), 'dryness citation coauthors');
assert.ok(appendixL.includes('Lausanne Movement. “Diasporas.”'), 'mission sources');
const workKey = (key) => work.match(new RegExp('^' + key + ':\\s*(\\S+)', 'm'))?.[1];
assert.equal(workKey('id'), manifest.workId);
assert.equal(work.match(/^\s+activeRelease:\s*(\S+)/m)?.[1], manifest.release);
assert.equal(release.match(/^workId:\s*(\S+)/m)?.[1], manifest.workId);
assert.equal(release.match(/^version:\s*(\S+)/m)?.[1], manifest.release);
const artifacts = new Map([...release.matchAll(/^  ([a-z0-9]+):\r?\n    url: ([^\n]+)\r?\n    filename: ([^\n]+)\r?\n    mimeType: ([^\n]+)\r?\n    sizeBytes: (\d+)\r?\n    sha256: ([a-f0-9]{64})/gm)].map(m => [m[1], { url: m[2].trim(), filename: m[3].trim(), bytes: Number(m[5]), hash: m[6] }]));
assert.equal(artifacts.size, 9, 'registered assets: PDF, EPUB, cover, 6 figures');
for (const [key, item] of artifacts) {
  const baseline = manifest.assets[key];
  assert.ok(baseline, 'manifest asset exists: ' + key);
  assert.equal(item.filename, baseline.filename, 'filename: ' + key);
  assert.equal(item.bytes, baseline.bytes, 'recorded byte size: ' + key);
  assert.equal(item.hash, baseline.sha256, 'recorded sha256: ' + key);
  assert.ok(item.url.startsWith('https://thiepn.dev/library/media/works/how-to-love-god/editions/1.1.0/'), 'release URL prefix: ' + key);
}
const releaseImages = new Set([...artifacts].filter(([key]) => key.startsWith('figure')).map(([, item]) => item.url));
assert.equal(imageURLs.length, 6, 'six intended inline reader figures');
assert.deepEqual([...imageURLs].sort(), [...releaseImages].sort(), 'figures match registered release URLs');
const author = work.match(/- name:\s*(.+)\r?\n  role:\s*author/)?.[1]?.trim();
const copyright = (await read(path.join(chapters, '00-copyright.md'))).match(/^Copyright © .+$/m)?.[0];
const attributionHold = author !== 'Jonathan' || !copyright?.includes('Jonathan');
console.log(JSON.stringify({
  scope: 'isolated-exact-head-source-only', verdict: 'STRUCTURAL_PASS',
  sections: files.length, bodyCount, sourceNoteCalls: calls.length,
  noteDefinitions: notes.length, noteReturns: backlinks.length,
  dailyPrompts: days.length, figureURLs: imageURLs.length,
  registeredAssetMetadataMatches: artifacts.size,
  historicalRecordHashDrifts: historicHashDrifts,
  attributionHold: attributionHold ? { metadataAuthor: author, copyright } : null,
  explicitNonClaims: ['no private account dependency tested', 'no Astro/reader/browser build tested', 'no PDF/EPUB binary downloaded or hashed', 'no release authorization'],
}, null, 2));
