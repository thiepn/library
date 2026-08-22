import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const catalogPath = resolve(publicDir, 'content/catalog.json');
const searchPath = resolve(publicDir, 'content/search-index.json');

const fail = (message) => { throw new Error(`[content] ${message}`); };
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const assert = (condition, message) => { if (!condition) fail(message); };

const catalog = await readJson(catalogPath);
assert(catalog.schemaVersion === 1, 'catalog schemaVersion must be 1');
assert(Array.isArray(catalog.works), 'catalog.works must be an array');

const ids = new Set();
const slugs = new Set();
for (const work of catalog.works) {
  for (const key of ['id', 'slug', 'title', 'description', 'language', 'publishedAt', 'manifestHref']) assert(typeof work[key] === 'string' && work[key], `work.${key} is required`);
  assert(!ids.has(work.id), `duplicate work id: ${work.id}`);
  assert(!slugs.has(work.slug), `duplicate work slug: ${work.slug}`);
  ids.add(work.id); slugs.add(work.slug);
  assert(Array.isArray(work.authors) && work.authors.length, `${work.slug}: authors required`);
  assert(Array.isArray(work.formats), `${work.slug}: formats must be an array`);

  const manifestPath = resolve(publicDir, work.manifestHref.replace(/^\//, ''));
  const manifest = await readJson(manifestPath);
  assert(manifest.schemaVersion === 1, `${work.slug}: manifest schemaVersion must be 1`);
  assert(manifest.id === work.id, `${work.slug}: manifest id mismatch`);
  assert(Array.isArray(manifest.chapters), `${work.slug}: chapters must be an array`);
  assert(Array.isArray(manifest.parts), `${work.slug}: parts must be an array`);
  const chapterIds = new Set();
  const chapterSlugs = new Set();
  for (const chapter of manifest.chapters) {
    assert(typeof chapter.id === 'string' && chapter.id, `${work.slug}: chapter id required`);
    assert(typeof chapter.slug === 'string' && chapter.slug, `${work.slug}: chapter slug required`);
    assert(typeof chapter.title === 'string' && chapter.title, `${work.slug}: chapter title required`);
    assert(typeof chapter.href === 'string' && chapter.href, `${work.slug}: chapter href required`);
    assert(!chapterIds.has(chapter.id), `${work.slug}: duplicate chapter id ${chapter.id}`);
    assert(!chapterSlugs.has(chapter.slug), `${work.slug}: duplicate chapter slug ${chapter.slug}`);
    chapterIds.add(chapter.id); chapterSlugs.add(chapter.slug);
    const chapterPath = resolve(publicDir, chapter.href.replace(/^\//, ''));
    const doc = await readJson(chapterPath);
    assert(doc.schemaVersion === 1 && doc.id === chapter.id && typeof doc.html === 'string', `${work.slug}/${chapter.slug}: invalid chapter document`);
  }
  for (const part of manifest.parts) {
    assert(Array.isArray(part.chapterIds), `${work.slug}: part.chapterIds must be an array`);
    for (const id of part.chapterIds) assert(chapterIds.has(id), `${work.slug}: part references unknown chapter ${id}`);
  }
  for (const format of manifest.formats) {
    if (format.kind === 'pdf' || format.kind === 'epub') await access(resolve(publicDir, format.href.replace(/^\//, '')));
  }
}

const search = await readJson(searchPath);
assert(search.schemaVersion === 1 && Array.isArray(search.entries), 'invalid search index');
for (const entry of search.entries) assert(ids.has(entry.workId), `search entry references unknown work ${entry.workId}`);

const contentEntries = await readdir(resolve(publicDir, 'content'));
console.log(`[content] valid — ${catalog.works.length} work(s), ${search.entries.length} search entries, ${contentEntries.length} content root entries`);
