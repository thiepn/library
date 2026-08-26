import type { ReaderSearchMatch, ReaderSearchResponse } from './search-engine';

export interface ReaderSearchCacheIdentity {
  workId: string;
  edition: number;
  releaseVersion: string;
}

interface ReaderSearchCacheRecord extends ReaderSearchCacheIdentity {
  schemaVersion: 1;
  query: string;
  response: ReaderSearchResponse;
  createdAt: string;
}

const CACHE_NAME = 'thiepn-library-reader-search-v1';
const CACHE_SCHEMA_VERSION = 1;
const memoryCache = new Map<string, ReaderSearchCacheRecord>();

function identityKey(identity: ReaderSearchCacheIdentity): string {
  return `${identity.workId}::${identity.edition}::${identity.releaseVersion}`;
}

function cacheKey(identity: ReaderSearchCacheIdentity, query: string): string {
  return `${identityKey(identity)}::${query}`;
}

function hashQuery(query: string): string {
  let hash = 2166136261;
  for (let index = 0; index < query.length; index += 1) {
    hash ^= query.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cacheRequest(identity: ReaderSearchCacheIdentity, query: string): Request {
  const origin = typeof location === 'undefined' ? 'https://thiepn.invalid' : location.origin;
  const encodedIdentity = [identity.workId, String(identity.edition), identity.releaseVersion]
    .map((part) => encodeURIComponent(part))
    .join('/');
  return new Request(`${origin}/library/.reader-search-cache/${encodedIdentity}/${hashQuery(query)}.json`, { method: 'GET' });
}

function isMatch(value: unknown): value is ReaderSearchMatch {
  if (typeof value !== 'object' || value === null) return false;
  const match = value as Partial<ReaderSearchMatch>;
  return typeof match.cfi === 'string'
    && match.cfi.startsWith('epubcfi(')
    && typeof match.href === 'string'
    && typeof match.sectionIndex === 'number'
    && Number.isFinite(match.sectionIndex)
    && typeof match.excerpt === 'string';
}

function isResponse(value: unknown): value is ReaderSearchResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<ReaderSearchResponse>;
  return Array.isArray(response.results)
    && response.results.every(isMatch)
    && typeof response.scannedSections === 'number'
    && Number.isFinite(response.scannedSections)
    && typeof response.totalSections === 'number'
    && Number.isFinite(response.totalSections)
    && typeof response.resultCount === 'number'
    && response.resultCount === response.results.length
    && typeof response.failedSections === 'number'
    && Number.isFinite(response.failedSections)
    && typeof response.truncated === 'boolean';
}

function isRecord(value: unknown, identity: ReaderSearchCacheIdentity, query: string): value is ReaderSearchCacheRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ReaderSearchCacheRecord>;
  return record.schemaVersion === CACHE_SCHEMA_VERSION
    && record.workId === identity.workId
    && record.edition === identity.edition
    && record.releaseVersion === identity.releaseVersion
    && record.query === query
    && isResponse(record.response)
    && typeof record.createdAt === 'string';
}

export class ReaderSearchCache {
  async get(identity: ReaderSearchCacheIdentity, query: string): Promise<ReaderSearchResponse | undefined> {
    const key = cacheKey(identity, query);
    const memory = memoryCache.get(key);
    if (memory && isRecord(memory, identity, query)) return structuredClone(memory.response);

    const storage = globalThis.caches;
    if (!storage) return undefined;
    const request = cacheRequest(identity, query);
    try {
      const cache = await storage.open(CACHE_NAME);
      const response = await cache.match(request);
      if (!response) return undefined;
      const parsed: unknown = await response.json();
      if (!isRecord(parsed, identity, query)) {
        await cache.delete(request);
        return undefined;
      }
      memoryCache.set(key, parsed);
      return structuredClone(parsed.response);
    } catch {
      return undefined;
    }
  }

  async set(identity: ReaderSearchCacheIdentity, query: string, response: ReaderSearchResponse): Promise<void> {
    if (!query || response.failedSections > 0) return;
    const record: ReaderSearchCacheRecord = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      ...identity,
      query,
      response,
      createdAt: new Date().toISOString(),
    };
    memoryCache.set(cacheKey(identity, query), record);

    const storage = globalThis.caches;
    if (!storage) return;
    try {
      const cache = await storage.open(CACHE_NAME);
      await cache.put(
        cacheRequest(identity, query),
        new Response(JSON.stringify(record), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      );
    } catch {
      // Search caching is an optimization. In-book search remains functional without Cache Storage.
    }
  }
}
