# RR5 — Offline, PWA, Update, and Storage Reliability

RR5 turns the P28 offline foundation into an explicit, testable browser-local storage contract. It does not claim that browser storage is archival or immune to operating-system/browser eviction.

## User contract

### Hosted releases

The `/library/downloads` screen is the authoritative offline inventory for hosted publications.

For every active hosted EPUB/PDF release it exposes:

- exact release identity and format;
- certified publication size;
- Download / Cancel / Remove state;
- byte or percentage progress when the response length is known;
- browser quota/usage guidance when the Storage API exposes it;
- current offline availability based on the service-worker publication cache.

A title is labelled **Available offline** only after all of these succeed:

1. the current hashed application assets are cached;
2. the exact reader route is cached;
3. the exact same-origin immutable publication URL is completely cached.

Simply opening a book no longer marks it as downloaded.

### Personal books

Personal EPUB/PDF imports remain exclusively in `thiepn-library-personal-books` IndexedDB. They are never duplicated into the service-worker publication cache. This avoids holding a second full copy of potentially large private files.

## Cache ownership

RR5 uses three distinct cache classes:

- versioned PWA core cache: minimum shell/fallback metadata;
- versioned PWA runtime cache: navigations and hashed application assets;
- stable hosted-publication cache: `thiepn-library-offline-publications-v1`.

The stable hosted-publication cache deliberately does **not** use the historical `thiepn-library-pwa-` prefix. A rollback to the P28 worker therefore cannot delete RR5 publication data as an unknown PWA cache.

The P28 EPUB publication cache is migrated forward into the stable cache when RR5 activates and is intentionally retained as rollback evidence/data. Stale versioned core/runtime caches are removed.

## PDF range behavior

Explicitly downloaded PDFs are stored as complete immutable responses. When PDF.js later requests a byte range while offline, the service worker returns a bounded `206 Partial Content` response sliced from that cached complete file. Non-cached hosted publications continue to use ordinary network requests and are never cached implicitly.

## Offline application assets

`pnpm build` generates `dist/library/offline-assets.json` after Astro builds. The manifest lists the hashed `/_astro/` assets for that exact source build.

Before a hosted publication is considered downloaded, the service worker caches this exact asset set plus the corresponding reader route. This prevents the false state where publication bytes exist but the reader cannot boot after restart because a lazy-loaded JavaScript chunk was never visited online.

## Download cancellation and atomicity

Each explicit download has an operation ID and an `AbortController` owned by the service worker.

Cancellation:

- stops the publication request;
- deletes any attempted publication entry for that URL;
- reports that no partial publication was retained;
- leaves already-complete existing downloads untouched.

Cache Storage commits publication entries only through a completed `cache.put` operation. The URL is immutable and an already-cached exact URL is returned without replacement.

## IndexedDB failure behavior

RR5 centralizes browser-storage failure classification:

- `QuotaExceededError` → quota guidance;
- `SecurityError`, `InvalidStateError`, `NotAllowedError` → denied/private-session style unavailable state;
- `AbortError` / inactive transaction → interrupted-write message that states existing committed data was not replaced;
- blocked version upgrade → close the older Library tab and retry;
- unknown failures remain explicit rather than being treated as successful persistence.

Personal-book storage moves from database version 1 to version 2 without replacing the `books` store. Open connections close on `versionchange`, and the test corpus verifies a v1 record survives the upgrade.

The main Library state database already uses transaction-scoped connections that close after every operation; RR5 does not change its authoritative progress/bookmark/annotation schemas.

## Service-worker update safety

A newly installed worker remains waiting while the current application controller is active. RR5 never calls `skipWaiting()` automatically.

The Offline downloads screen surfaces an available update. Activation requires the user to choose **Update and reload** outside the fullscreen reader. The active reader therefore cannot be silently replaced mid-session by background update discovery.

The deterministic update test installs a byte-different next worker on the same scope and proves:

- the previous controller remains active while the next worker waits;
- activation happens only after `SKIP_WAITING`;
- legacy publication migration occurs on activation;
- stale runtime caches are removed;
- publication caches survive a subsequent rollback to the original worker.

## Automated evidence

`pnpm test:offline` uses a service-worker-enabled Playwright profile.

Cross-engine coverage (Chromium, Firefox, WebKit):

- explicit EPUB download and offline reopen;
- explicit PDF download and offline reopen;
- cached PDF range handling through the integrated reader;
- remove/download inventory truth;
- simulated Cache Storage eviction;
- quota exhaustion;
- interrupted IndexedDB write;
- denied/private-session style IndexedDB access;
- blocked v1→v2 upgrade and preserved record;
- personal-file Cache Storage isolation.

Chromium and Firefox use Playwright's native browser-context offline mode. Playwright/WebKit's native offline toggle can abort a document navigation internally before the page's service worker is allowed to satisfy the request, so RR5 does not treat that automation artifact as an application failure. The WebKit project instead runs through a qualification-only localhost origin proxy: normal requests are forwarded to the same Astro preview, and the test can deliberately reset origin connections while leaving the browser and production service worker running. WebKit must then reopen the same cached navigations, EPUB/PDF readers, and personal-reader routes through the real RR5 service worker. The proxy is test-only and is never included in the production artifact.

Chromium-only deterministic lifecycle coverage additionally tests waiting worker activation, cache migration/stale cleanup, rollback, and an ephemeral/private-style context boundary.

These automated browser contexts and the WebKit origin-outage proxy do not substitute for RR2 physical iPhone/Android installed-PWA testing.

## Release gates

RR5 is complete when:

- `pnpm certify:offline-reliability` passes;
- Quality remains green;
- Browser Acceptance remains green;
- Publication Compatibility remains green;
- Performance Budget remains green;
- Offline Reliability passes its cross-engine matrix;
- production build runs Offline Reliability after media staging and before Pages artifact upload;
- live production verification remains green.
