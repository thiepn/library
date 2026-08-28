const SW_VERSION = 'rr5-v1';
const CACHE_PREFIX = 'thiepn-library-pwa-';
const CORE_CACHE = `${CACHE_PREFIX}core-${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${SW_VERSION}`;
const HOSTED_PUBLICATION_CACHE = 'thiepn-library-offline-publications-v1';
const LEGACY_PUBLICATION_CACHES = new Set([`${CACHE_PREFIX}publication-p28-v1`]);
const OWN_CACHES = new Set([CORE_CACHE, RUNTIME_CACHE]);
const activeDownloads = new Map();

const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const scoped = (path = '') => `${scopePath}${path}`;
const OFFLINE_URL = scoped('offline/');
const OFFLINE_ASSET_MANIFEST = scoped('offline-assets.json');
const CORE_URLS = [
  scopePath,
  OFFLINE_URL,
  scoped('manifest.webmanifest'),
  scoped('favicon.svg'),
];

function isSameOriginScoped(url) {
  return url.origin === scopeUrl.origin && url.pathname.startsWith(scopePath);
}

function publicationFormat(url) {
  if (!isSameOriginScoped(url) || !url.pathname.startsWith(scoped('media/'))) return undefined;
  if (/\.epub$/i.test(url.pathname)) return 'epub';
  if (/\.pdf$/i.test(url.pathname)) return 'pdf';
  return undefined;
}

function isImmutableBuildAsset(url) {
  return isSameOriginScoped(url)
    && (url.pathname.startsWith(scoped('_astro/')) || url.pathname.startsWith(scoped('pagefind/')));
}

function isCoreAsset(url) {
  return isSameOriginScoped(url)
    && (url.pathname === scoped('manifest.webmanifest') || url.pathname === scoped('favicon.svg'));
}

function cacheableResponse(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const cacheControl = response.headers.get('cache-control') ?? '';
  return !/\bno-store\b/i.test(cacheControl);
}

function publicationRequest(url) {
  return new Request(url.href, { credentials: 'same-origin' });
}

function post(port, message) {
  try { port?.postMessage(message); } catch {}
}

async function notifyOfflineLibraryChanged() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: 'OFFLINE_LIBRARY_CHANGED' });
}

async function putIfCacheable(cacheName, request, response) {
  if (!cacheableResponse(response)) return false;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return true;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (cacheableResponse(response)) await cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    await putIfCacheable(RUNTIME_CACHE, request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw new Error('Library is offline and no cached navigation is available.');
  }
}

async function cacheUrls(urls) {
  const cache = await caches.open(RUNTIME_CACHE);
  for (const raw of urls.slice(0, 96)) {
    try {
      const url = new URL(raw, scopeUrl.origin);
      if (!isSameOriginScoped(url) || publicationFormat(url)) continue;
      const request = new Request(url.href, { credentials: 'same-origin' });
      const response = await fetch(request);
      if (cacheableResponse(response)) await cache.put(request, response.clone());
    } catch {
      // Document warmup is best effort and must never block installation or reading.
    }
  }
}

async function cacheOfflineApplicationAssets() {
  const manifestUrl = new URL(OFFLINE_ASSET_MANIFEST, scopeUrl.origin);
  const response = await fetch(new Request(manifestUrl.href, { cache: 'no-store', credentials: 'same-origin' }));
  if (!cacheableResponse(response)) throw new Error('The offline application asset manifest is unavailable.');
  const payload = await response.clone().json();
  const paths = Array.isArray(payload?.assets) ? payload.assets.filter((value) => typeof value === 'string') : [];
  if (!paths.length || paths.length > 512) throw new Error('The offline application asset manifest is invalid.');

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(manifestUrl.href, response);
  for (let offset = 0; offset < paths.length; offset += 8) {
    await Promise.all(paths.slice(offset, offset + 8).map(async (raw) => {
      const url = new URL(raw, scopeUrl.origin);
      if (!isImmutableBuildAsset(url)) throw new Error('The offline asset manifest contains an unsupported path.');
      const request = new Request(url.href, { credentials: 'same-origin' });
      const cached = await cache.match(request);
      if (cached) return;
      const asset = await fetch(request);
      if (!cacheableResponse(asset)) throw new Error(`Unable to cache application asset ${url.pathname}.`);
      await cache.put(request, asset.clone());
    }));
  }
}

async function cacheOfflineReaderDocument(rawUrl) {
  const url = new URL(rawUrl, scopeUrl.origin);
  if (!isSameOriginScoped(url) || publicationFormat(url)) throw new Error('The reader route is outside the Library application scope.');
  const request = new Request(url.href, { credentials: 'same-origin' });
  const response = await fetch(request);
  if (!cacheableResponse(response)) throw new Error('The reader shell could not be prepared for offline use.');
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
}

async function preparePersonalReaders(urls) {
  if (!Array.isArray(urls) || !urls.length || urls.length > 32) throw new Error('Personal reader route list is invalid.');
  await cacheOfflineApplicationAssets();
  for (const raw of urls) {
    if (typeof raw !== 'string') throw new Error('Personal reader route is invalid.');
    await cacheOfflineReaderDocument(raw);
  }
}

function offlineRecord(url, response, legacy = false) {
  const format = publicationFormat(url);
  if (!format) return undefined;
  const size = Number(response.headers.get('x-thiepn-library-size') ?? response.headers.get('content-length') ?? 0);
  const sha256 = response.headers.get('x-thiepn-library-sha256') ?? undefined;
  const cachedAt = response.headers.get('x-thiepn-library-cached-at') ?? undefined;
  return {
    url: url.href,
    format,
    sizeBytes: Number.isFinite(size) && size >= 0 ? size : 0,
    ...(sha256 ? { sha256 } : {}),
    ...(cachedAt ? { cachedAt } : {}),
    ...(legacy ? { legacy: true } : {}),
  };
}

async function listOfflinePublications() {
  const records = [];
  const stable = await caches.open(HOSTED_PUBLICATION_CACHE);
  for (const request of await stable.keys()) {
    const response = await stable.match(request);
    if (!response) continue;
    const record = offlineRecord(new URL(request.url), response);
    if (record) records.push(record);
  }
  records.sort((a, b) => a.url.localeCompare(b.url));
  return records;
}

async function migrateLegacyPublicationCaches() {
  const stable = await caches.open(HOSTED_PUBLICATION_CACHE);
  const keys = await caches.keys();
  for (const cacheName of keys) {
    if (!LEGACY_PUBLICATION_CACHES.has(cacheName)) continue;
    const legacy = await caches.open(cacheName);
    for (const request of await legacy.keys()) {
      const url = new URL(request.url);
      if (!publicationFormat(url)) continue;
      const stableRequest = publicationRequest(url);
      if (await stable.match(stableRequest)) continue;
      const response = await legacy.match(request);
      if (response && cacheableResponse(response)) await stable.put(stableRequest, response.clone());
    }
  }
}

async function downloadOfflinePublication(data, port) {
  const operationId = typeof data.operationId === 'string' ? data.operationId : '';
  const artifact = data.artifact && typeof data.artifact === 'object' ? data.artifact : {};
  const rawUrl = typeof artifact.url === 'string' ? artifact.url : '';
  const rawReaderUrl = typeof artifact.readerUrl === 'string' ? artifact.readerUrl : '';
  if (!operationId || !rawUrl || !rawReaderUrl) {
    post(port, { type: 'OFFLINE_RESULT', ok: false, error: 'Offline publication metadata is incomplete.' });
    return;
  }

  let url;
  try { url = new URL(rawUrl, scopeUrl.origin); } catch {
    post(port, { type: 'OFFLINE_RESULT', ok: false, error: 'Offline publication URL is invalid.' });
    return;
  }
  const format = publicationFormat(url);
  if (!format || artifact.format !== format) {
    post(port, { type: 'OFFLINE_RESULT', ok: false, error: 'Only exact same-origin hosted EPUB/PDF releases can be downloaded.' });
    return;
  }

  const request = publicationRequest(url);
  const cache = await caches.open(HOSTED_PUBLICATION_CACHE);
  const existing = await cache.match(request);
  if (existing) {
    post(port, { type: 'OFFLINE_RESULT', ok: true, record: offlineRecord(url, existing) });
    return;
  }

  const controller = new AbortController();
  activeDownloads.set(operationId, controller);
  const expectedSize = Number(artifact.sizeBytes ?? 0);
  const sha256 = typeof artifact.sha256 === 'string' ? artifact.sha256 : '';

  try {
    post(port, { type: 'OFFLINE_PROGRESS', operationId, url: url.href, loadedBytes: 0, totalBytes: expectedSize || undefined, phase: 'preparing' });
    await cacheOfflineApplicationAssets();
    await cacheOfflineReaderDocument(rawReaderUrl);
    if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError');

    const response = await fetch(request, { signal: controller.signal });
    if (!cacheableResponse(response)) throw new Error('The hosted publication could not be downloaded.');
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (expectedSize > 0 && contentLength > 0 && contentLength !== expectedSize) {
      throw new Error('The hosted publication size does not match its certified release metadata.');
    }

    const headers = new Headers(response.headers);
    headers.set('x-thiepn-library-size', String(expectedSize > 0 ? expectedSize : contentLength));
    headers.set('x-thiepn-library-format', format);
    headers.set('x-thiepn-library-cached-at', new Date().toISOString());
    if (sha256) headers.set('x-thiepn-library-sha256', sha256);

    let loadedBytes = 0;
    if (response.body) {
      const [cacheStream, progressStream] = response.body.tee();
      const cachedResponse = new Response(cacheStream, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      const cacheWrite = cache.put(request, cachedResponse);
      const reader = progressStream.getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          loadedBytes += part.value.byteLength;
          post(port, {
            type: 'OFFLINE_PROGRESS',
            operationId,
            url: url.href,
            loadedBytes,
            totalBytes: expectedSize || contentLength || undefined,
            phase: 'downloading',
          });
        }
      } finally {
        reader.releaseLock();
      }
      await cacheWrite;
    } else {
      const bytes = await response.arrayBuffer();
      loadedBytes = bytes.byteLength;
      await cache.put(request, new Response(bytes, { status: response.status, statusText: response.statusText, headers }));
    }

    if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
    const stored = await cache.match(request);
    if (!stored) throw new Error('The browser did not retain the completed offline publication.');
    post(port, {
      type: 'OFFLINE_PROGRESS',
      operationId,
      url: url.href,
      loadedBytes,
      totalBytes: expectedSize || contentLength || undefined,
      phase: 'finalizing',
    });
    const record = offlineRecord(url, stored);
    await notifyOfflineLibraryChanged();
    post(port, { type: 'OFFLINE_RESULT', ok: true, record });
  } catch (error) {
    await cache.delete(request).catch(() => false);
    const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
    post(port, {
      type: 'OFFLINE_RESULT',
      ok: false,
      cancelled,
      error: cancelled
        ? 'Offline download cancelled. No partial publication was retained.'
        : error instanceof Error ? error.message : 'Unable to download this publication for offline use.',
    });
  } finally {
    activeDownloads.delete(operationId);
  }
}

async function removeOfflinePublication(rawUrl) {
  const url = new URL(rawUrl, scopeUrl.origin);
  if (!publicationFormat(url)) throw new Error('Offline publication URL is invalid.');
  const cache = await caches.open(HOSTED_PUBLICATION_CACHE);
  const removed = await cache.delete(publicationRequest(url));
  if (removed) await notifyOfflineLibraryChanged();
  return removed;
}

async function findCachedPublication(request, url) {
  const stable = await caches.open(HOSTED_PUBLICATION_CACHE);
  const cached = await stable.match(publicationRequest(url));
  if (cached) return cached;
  if (!/\.epub$/i.test(url.pathname)) return undefined;
  for (const cacheName of LEGACY_PUBLICATION_CACHES) {
    if (!(await caches.keys()).includes(cacheName)) continue;
    const legacy = await caches.open(cacheName);
    const response = await legacy.match(request);
    if (response) return response;
  }
  return undefined;
}

async function rangedResponse(cached, rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return cached;
  const bytes = await cached.arrayBuffer();
  const size = bytes.byteLength;
  let start = match[1] ? Number(match[1]) : undefined;
  let end = match[2] ? Number(match[2]) : undefined;

  if (start === undefined && end !== undefined) {
    const suffix = Math.min(size, end);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = start ?? 0;
    end = Math.min(size - 1, end ?? size - 1);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  const headers = new Headers(cached.headers);
  headers.delete('content-encoding');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

async function hostedPublicationResponse(request, url) {
  const cached = await findCachedPublication(request, url);
  if (cached) {
    const range = request.headers.get('range');
    return range ? rangedResponse(cached, range) : cached;
  }
  return fetch(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await migrateLegacyPublicationCaches();
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && !OWN_CACHES.has(key) && !LEGACY_PUBLICATION_CACHES.has(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
    await notifyOfflineLibraryChanged();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const port = event.ports?.[0];

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (data.type === 'CACHE_DOCUMENT_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(cacheUrls(data.urls.filter((url) => typeof url === 'string')));
    return;
  }

  if (data.type === 'PREPARE_PERSONAL_READERS') {
    event.waitUntil(preparePersonalReaders(data.urls)
      .then(() => post(port, { type: 'OFFLINE_RESULT', ok: true }))
      .catch((error) => post(port, { type: 'OFFLINE_RESULT', ok: false, error: error instanceof Error ? error.message : 'Unable to prepare personal readers for offline use.' })));
    return;
  }

  if (data.type === 'LIST_OFFLINE_PUBLICATIONS') {
    event.waitUntil(listOfflinePublications()
      .then((records) => post(port, { type: 'OFFLINE_RESULT', ok: true, records }))
      .catch((error) => post(port, { type: 'OFFLINE_RESULT', ok: false, error: error instanceof Error ? error.message : 'Unable to inspect offline publications.' })));
    return;
  }

  if (data.type === 'CACHE_OFFLINE_PUBLICATION') {
    event.waitUntil(downloadOfflinePublication(data, port));
    return;
  }

  if (data.type === 'CANCEL_OFFLINE_DOWNLOAD' && typeof data.operationId === 'string') {
    activeDownloads.get(data.operationId)?.abort();
    return;
  }

  if (data.type === 'REMOVE_OFFLINE_PUBLICATION' && typeof data.url === 'string') {
    event.waitUntil(removeOfflinePublication(data.url)
      .then(() => post(port, { type: 'OFFLINE_RESULT', ok: true }))
      .catch((error) => post(port, { type: 'OFFLINE_RESULT', ok: false, error: error instanceof Error ? error.message : 'Unable to remove offline publication.' })));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOriginScoped(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (publicationFormat(url)) {
    event.respondWith(hostedPublicationResponse(request, url));
    return;
  }

  if (isImmutableBuildAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isCoreAsset(url) || url.pathname === OFFLINE_ASSET_MANIFEST) event.respondWith(cacheFirst(request, CORE_CACHE));
});
