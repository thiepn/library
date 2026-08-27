# P28 — Offline / PWA Preparation

P28 adds a conservative Progressive Web App and offline foundation to Thiepn Library without changing publication selection, release identity, or reader persistence semantics.

## Scope

The Library now has:

- a scoped service worker at `/library/service-worker.js`;
- a complete `/library/` web app manifest with standalone metadata and install icons;
- service-worker registration from both catalog pages and the fullscreen EPUB reader;
- a self-contained offline fallback page;
- network-first navigation caching for pages already visited;
- cache-first handling for immutable hashed build assets;
- cache-first handling for exact same-origin immutable EPUB release artifacts;
- first-visit document warmup after the initial worker activates;
- best-effort EPUB warmup only after the full native reader successfully opens the exact resolved publication;
- explicit, non-automatic activation for waiting service-worker updates.

## Publication integrity rule

Offline support must never become another publication resolver.

The existing P25 release resolver remains authoritative. P28 receives only the already-localized `publication.epub.url` chosen by that resolver. The service worker independently rejects any publication warmup that is:

- cross-origin;
- outside `/library/media/`;
- not an `.epub` resource;
- a PDF or another media type.

Release URLs are immutable, so cache-first replay cannot silently substitute a newer or older edition at the same URL.

## Caching policy

### Core cache

The install cache contains only the minimum resilient shell:

- `/library/`
- `/library/offline/`
- `/library/manifest.webmanifest`
- `/library/favicon.svg`

### Runtime cache

Successful navigations are stored as a best-effort offline replay of pages the user has actually visited. Hashed Astro and Pagefind assets use cache-first behavior after first fetch.

### Publication cache

Only same-origin immutable EPUB files under `/library/media/` are cached automatically. PDFs are deliberately excluded because they can be substantially larger and are already exposed as explicit fallback/download artifacts.

The browser remains free to evict Cache Storage under storage pressure. P28 therefore treats offline availability as best effort, not as a durable archival guarantee.

## First-visit behavior

A newly installed service worker does not control the first request that created the page. After activation, the client sends the current same-origin document and already-loaded local static assets to the worker for best-effort warmup. When a native EPUB opens successfully, its exact active-release URL is separately offered to the publication cache.

A failed EPUB boot is never cached through this warmup path.

## Update behavior

P28 intentionally does **not** call `skipWaiting()` automatically.

A newly downloaded worker waits under the browser's normal service-worker lifecycle while an existing Library session is active. This prevents a reader implementation update from replacing the active runtime in the middle of a reading session. The client exposes `activateWaitingLibraryWorker()` for a future explicit update UI.

No page reload is forced when a new controller activates.

## Offline fallback

Navigation uses network-first behavior. If the network fails:

1. an exact cached navigation is returned when available;
2. otherwise the self-contained `/library/offline/` response is returned.

The offline fallback contains inline styling and has no dependency on Google Fonts or an Astro CSS bundle.

## Security and privacy

P28:

- stays under the `/library/` service-worker scope;
- ignores non-GET and range requests;
- does not cache cross-origin responses;
- does not cache PDFs automatically;
- does not touch IndexedDB reader progress, bookmarks, annotations, or settings;
- does not add analytics, telemetry, background sync, push notifications, or remote tracking;
- cleans up only caches using the `thiepn-library-pwa-` namespace.

The existing Content Security Policy already allows same-origin workers.

## Deliberate non-goals

P28 is preparation, not a promise that the entire Library is permanently available offline. It does not:

- pre-download every title;
- pre-cache every work page;
- guarantee Cache Storage retention;
- implement background sync or push notifications;
- auto-cache PDF files;
- expose a user-facing offline-download manager;
- replace P26 network/fallback error handling;
- change the legacy Markdown reader or its URLs.

Broader cross-browser install/offline certification remains part of later browser and regression phases.
