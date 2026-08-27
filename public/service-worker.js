const SW_VERSION = 'p28-v1';
const CACHE_PREFIX = 'thiepn-library-pwa-';
const CORE_CACHE = `${CACHE_PREFIX}core-${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${SW_VERSION}`;
const PUBLICATION_CACHE = `${CACHE_PREFIX}publication-${SW_VERSION}`;
const OWN_CACHES = new Set([CORE_CACHE, RUNTIME_CACHE, PUBLICATION_CACHE]);

const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const scoped = (path = '') => `${scopePath}${path}`;
const OFFLINE_URL = scoped('offline/');
const CORE_URLS = [
  scopePath,
  OFFLINE_URL,
  scoped('manifest.webmanifest'),
  scoped('favicon.svg'),
];

function isSameOriginScoped(url) {
  return url.origin === scopeUrl.origin && url.pathname.startsWith(scopePath);
}

function isImmutableReaderEpub(url) {
  return isSameOriginScoped(url)
    && url.pathname.startsWith(scoped('media/'))
    && /\.epub$/i.test(url.pathname);
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

async function putIfCacheable(cacheName, request, response) {
  if (!cacheableResponse(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
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
  for (const raw of urls.slice(0, 48)) {
    try {
      const url = new URL(raw, scopeUrl.origin);
      if (!isSameOriginScoped(url) || isImmutableReaderEpub(url) || /\.pdf$/i.test(url.pathname)) continue;
      const request = new Request(url.href, { credentials: 'same-origin' });
      const response = await fetch(request);
      if (cacheableResponse(response)) await cache.put(request, response.clone());
    } catch {
      // Warmup is best effort and must never block installation or reading.
    }
  }
}

async function cacheReaderEpub(rawUrl) {
  const url = new URL(rawUrl, scopeUrl.origin);
  if (!isImmutableReaderEpub(url)) return false;

  const request = new Request(url.href, { credentials: 'same-origin' });
  const cache = await caches.open(PUBLICATION_CACHE);
  if (await cache.match(request)) return true;

  const response = await fetch(request);
  if (!cacheableResponse(response)) return false;
  await cache.put(request, response.clone());
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && !OWN_CACHES.has(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data && typeof event.data === 'object' ? event.data : {};

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (data.type === 'CACHE_DOCUMENT_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(cacheUrls(data.urls.filter((url) => typeof url === 'string')));
    return;
  }

  if (data.type === 'CACHE_READER_EPUB' && typeof data.url === 'string') {
    event.waitUntil(cacheReaderEpub(data.url).catch(() => false));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (!isSameOriginScoped(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isImmutableReaderEpub(url)) {
    event.respondWith(cacheFirst(request, PUBLICATION_CACHE));
    return;
  }

  if (isImmutableBuildAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isCoreAsset(url)) event.respondWith(cacheFirst(request, CORE_CACHE));
});
