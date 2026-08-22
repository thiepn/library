import type { Catalog, CatalogWork, ChapterDocument, SearchIndex, WorkManifest } from '../domain';

const BASE = import.meta.env.BASE_URL;

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Invalid content field: ${field}`);
}

function validateCatalogWork(value: unknown): CatalogWork {
  if (!value || typeof value !== 'object') throw new Error('Invalid catalog work');
  const work = value as Record<string, unknown>;
  assertString(work.id, 'work.id');
  assertString(work.slug, 'work.slug');
  assertString(work.title, 'work.title');
  assertString(work.description, 'work.description');
  assertString(work.language, 'work.language');
  assertString(work.publishedAt, 'work.publishedAt');
  assertString(work.manifestHref, 'work.manifestHref');
  if (!Array.isArray(work.authors) || !work.authors.every((author) => typeof author === 'string')) throw new Error('Invalid work.authors');
  if (!Array.isArray(work.topics) || !work.topics.every((topic) => typeof topic === 'string')) throw new Error('Invalid work.topics');
  if (!Array.isArray(work.formats)) throw new Error('Invalid work.formats');
  return value as CatalogWork;
}

async function getJson<T>(href: string): Promise<T> {
  const response = await fetch(href, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Content request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function loadCatalog(): Promise<Catalog> {
  const data = await getJson<Catalog>(`${BASE}content/catalog.json`);
  if (data.schemaVersion !== 1 || !Array.isArray(data.works)) throw new Error('Unsupported catalog schema');
  data.works.forEach(validateCatalogWork);
  return data;
}

export async function loadWork(work: CatalogWork): Promise<WorkManifest> {
  const data = await getJson<WorkManifest>(`${BASE}${work.manifestHref.replace(/^\//, '')}`);
  if (data.schemaVersion !== 1 || data.id !== work.id || !Array.isArray(data.chapters) || !Array.isArray(data.parts)) {
    throw new Error('Invalid work manifest');
  }
  return data;
}

export async function loadChapter(chapterHref: string): Promise<ChapterDocument> {
  const data = await getJson<ChapterDocument>(`${BASE}${chapterHref.replace(/^\//, '')}`);
  if (data.schemaVersion !== 1) throw new Error('Unsupported chapter schema');
  assertString(data.id, 'chapter.id');
  assertString(data.title, 'chapter.title');
  assertString(data.html, 'chapter.html');
  return data;
}

export async function loadSearchIndex(): Promise<SearchIndex> {
  const data = await getJson<SearchIndex>(`${BASE}content/search-index.json`);
  if (data.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('Unsupported search index schema');
  return data;
}
