# P27 — Performance & Loading

## Status

P27 hardens the native EPUB reader so first paint, publication loading, and long-running reader work do not compete unnecessarily for the main thread.

The phase does not change publication identity, retry semantics, reading behavior, or the P24 styling contract. It changes when work begins, how background work yields, and how local performance evidence is exposed for later regression/cross-browser certification.

## Governing performance rule

The reader uses a staged startup path:

```text
HTML + reader shell
→ shell paint opportunity
→ load full native-reader module
→ open the already-resolved active EPUB
→ first readable location
→ non-critical background work during browser idle time
```

The active EPUB artifact is preloaded from the document head while the code-split reader module is being fetched/parsed. This allows network work and shell-first rendering to overlap rather than serializing the whole startup path.

## Shell-first bootstrap

The public native `/works/[slug]/read` route no longer statically imports the complete P5–P26 reader stack through the reader barrel.

Only the small bootstrap/recovery/performance primitives are loaded with the route. After one `requestAnimationFrame`, the route dynamically imports `fallback-harness.ts`, then mounts the same P26 recovery wrapper and complete P24 stack used before P27.

This preserves:

- active-release identity;
- same-release retry behavior;
- explicit Markdown/PDF/EPUB fallbacks;
- progress/resume;
- TOC/navigation;
- search;
- bookmarks;
- highlights/notes;
- mobile/desktop behavior;
- accessibility;
- EPUB styling compatibility.

P27 does not introduce a reduced fast-path reader.

## Publication preload

`EpubReaderLayout.astro` accepts the already-localized active EPUB URL and emits a high-priority same-origin preload:

```html
<link rel="preload" as="fetch" type="application/epub+zip" ...>
```

The preload is only emitted for native EPUB pages. Legacy Markdown reader pages do not download EPUB artifacts speculatively.

The URL is the same exact active-release artifact already selected by P25/P26; P27 never chooses or preloads another edition.

## Non-critical location maps

P15 location-map generation is valuable for accurate scrubbing but is not required for first readable content.

P27 replaces fixed-timer generation with `scheduleReaderIdleTask()`:

1. exact-release browser cache is checked first;
2. if no valid map exists, generation is scheduled after a minimum delay;
3. `requestIdleCallback` is used where supported;
4. hidden documents wait until visible;
5. browsers without `requestIdleCallback` receive a bounded timer fallback;
6. teardown cancels pending work;
7. actual `book.locations.generate()` still uses the existing release-bound cache.

The initial reader therefore remains usable while the progress scrubber upgrades asynchronously.

## Cooperative whole-book search

Search still opens its search-only EPUB adapter lazily, only after the user actually submits a query.

P27 changes the section scan so it:

- unloads each searched spine section immediately as before;
- reports progress at bounded yield boundaries rather than on every section;
- uses `scheduler.yield()` when the browser exposes it;
- falls back to a zero-delay task yield elsewhere;
- checks cancellation immediately after yielding.

This reduces unnecessary UI churn and keeps navigation/input responsive during long searches.

## Local performance evidence

`ReaderPerformanceController` records coarse, local-only runtime evidence:

- shell bootstrap start;
- shell paint opportunity;
- first ready location;
- total boot duration;
- supported Long Task entries and cumulative duration;
- current load phase.

Evidence is exposed through `data-reader-*` attributes and the browser Performance API. It is intended for P30/P31 regression and browser certification.

No performance data is transmitted. P27 contains no analytics endpoint, `sendBeacon`, or telemetry upload.

## Background scheduler contract

`src/lib/reader/performance.ts` provides two reusable primitives:

- `scheduleReaderIdleTask()` for cancellable non-critical work that should avoid initial interaction/paint;
- `yieldReaderMainThread()` for cooperative long-running operations.

Both have compatibility fallbacks and neither is required for correctness. A browser without idle/scheduler APIs still receives the same reader functionality.

## Failure handling

P26 remains authoritative for failures.

Code splitting does introduce one earlier failure boundary: the full reader module itself may fail to load. The P26 bootstrap recovery UI remains available in that case and offers a page reload plus the same explicit fallback links.

The reader never silently changes publication or format to make a slow or failed launch disappear.

## Performance-budget philosophy

P27 certifies architecture and scheduling invariants rather than hardcoding a single millisecond threshold in CI. Startup time depends on EPUB size, cache state, device, browser, and network.

Runtime measurements are deliberately exposed so later browser/device certification can establish realistic budgets without making synthetic GitHub-hosted CI timing a false production guarantee.

## Phase boundary

P27 does:

- create a shell-first, code-split native-reader bootstrap;
- preload the exact active EPUB in parallel;
- defer location-map generation to idle time;
- pause non-critical idle work while hidden;
- cooperatively yield whole-book search;
- reduce search progress-render churn;
- expose local boot and long-task evidence;
- preserve the complete P26/P24 reader stack.

P27 does not:

- add a service worker or offline cache policy (P28);
- remove legacy routes (P29/P35);
- claim cross-browser performance certification (P31);
- change release selection or retry semantics;
- transmit analytics or reader telemetry.
