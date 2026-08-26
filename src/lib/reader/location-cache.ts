import type { ReaderLocationMap } from './types';

export interface ReaderLocationCacheIdentity {
  workId: string;
  edition: number;
  releaseVersion: string;
}

interface ReaderLocationCacheRecord extends ReaderLocationCacheIdentity {
  schemaVersion: 1;
  serialized: string;
  length: number;
  generatedAt: string;
}

const CACHE_NAME = 'thiepn-library-reader-locations-v1';
const CACHE_SCHEMA_VERSION = 1;
const memoryCache = new Map<string, ReaderLocationCacheRecord>();

function cacheKey(identity: ReaderLocationCacheIdentity): string {
  return `${identity.workId}::${identity.edition}::${identity.releaseVersion}`;
}

function cacheRequest(identity: ReaderLocationCacheIdentity): Request {
  const encoded = [identity.workId, String(identity.edition), identity.releaseVersion]
    .map((part) => encodeURIComponent(part))
    .join('/');
  return new Request(`${location.origin}/library/.reader-location-cache/${encoded}.json`, { method: 'GET' });
}

function isRecord(value: unknown, identity: ReaderLocationCacheIdentity): value is ReaderLocationCacheRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ReaderLocationCacheRecord>;
  return record.schemaVersion === CACHE_SCHEMA_VERSION
    && record.workId === identity.workId
    && record.edition === identity.edition
    && record.releaseVersion === identity.releaseVersion
    && typeof record.serialized === 'string'
    && record.serialized.length > 2
    && typeof record.length === 'number'
    && Number.isFinite(record.length)
    && record.length > 0
    && typeof record.generatedAt === 'string';
}

function toMap(record: ReaderLocationCacheRecord): ReaderLocationMap {
  return { serialized: record.serialized, length: record.length };
}

function toRecord(identity: ReaderLocationCacheIdentity, map: ReaderLocationMap): ReaderLocationCacheRecord {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    ...identity,
    serialized: map.serialized,
    length: map.length,
    generatedAt: new Date().toISOString(),
  };
}

export class ReaderLocationCache {
  async get(identity: ReaderLocationCacheIdentity): Promise<ReaderLocationMap | undefined> {
    const key = cacheKey(identity);
    const memory = memoryCache.get(key);
    if (memory && isRecord(memory, identity)) return toMap(memory);

    const storage = globalThis.caches;
    if (!storage) return undefined;
    try {
      const cache = await storage.open(CACHE_NAME);
      const response = await cache.match(cacheRequest(identity));
      if (!response) return undefined;
      const parsed: unknown = await response.json();
      if (!isRecord(parsed, identity)) {
        await cache.delete(cacheRequest(identity));
        return undefined;
      }
      memoryCache.set(key, parsed);
      return toMap(parsed);
    } catch {
      return undefined;
    }
  }

  async set(identity: ReaderLocationCacheIdentity, map: ReaderLocationMap): Promise<void> {
    if (!map.serialized || map.length <= 0) return;
    const record = toRecord(identity, map);
    memoryCache.set(cacheKey(identity), record);

    const storage = globalThis.caches;
    if (!storage) return;
    try {
      const cache = await storage.open(CACHE_NAME);
      await cache.put(
        cacheRequest(identity),
        new Response(JSON.stringify(record), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      );
    } catch {
      // Location maps are an optimization. Reading remains functional without browser cache storage.
    }
  }
}
