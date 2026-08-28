# RR4 — Performance, Memory, and Large-Document Budgets

## Purpose

RR4 turns smooth-reader performance into a release contract rather than an informal expectation. It measures deterministic large publications under a controlled Chromium profile while keeping cross-browser correctness in RR1/RR3 and physical-device evidence in RR2.

Timing numbers are deliberately broad release ceilings, not marketing claims. GitHub-hosted runners are noisy; the primary hard guarantees are bounded allocation, cancellation, stale-work rejection, and memory reclamation. Physical-device performance remains a separate acceptance class.

## Deterministic workload

RR4 owns two generated stress publications and one oversized-page PDF:

- **Large EPUB:** 96 reflowable XHTML spine sections, a full navigation document, repeated prose, and a late-book marker.
- **Large PDF:** 160 searchable pages with a late-page marker.
- **Oversized PDF:** one 12,000 × 18,000 point page used to prove fit-mode geometry and raster allocation are bounded.

These fixtures are generated in memory and contain no third-party publication content.

## Controlled profile

Release timing runs use Playwright Chromium desktop at 1440 × 900 with:

- one worker;
- service workers disabled;
- 4× CPU throttling through the Chromium DevTools Protocol;
- a fresh isolated browser context for every test;
- failure-only trace, screenshot, and video evidence.

This is a reproducible CI stress profile. It does not substitute for the RR2 lower-performance Android target.

## Release budgets

| Operation | Release ceiling |
| --- | ---: |
| Import 96-section EPUB | 20,000 ms |
| Large EPUB first readable state after open | 20,000 ms |
| Large EPUB next-page interaction | 3,000 ms |
| Import 160-page PDF | 15,000 ms |
| Large PDF first rendered page after open | 15,000 ms |
| Direct PDF page navigation | 3,000 ms |
| Search all 160 PDF pages for a late marker | 20,000 ms |
| Repeated reader lifecycle heap growth after forced GC | ≤ 96 MiB |

A timing retry may protect against transient CI host contention, but a release passes only if one complete attempt remains below every ceiling without uncaught browser errors.

## Allocation budgets

PDF rendering has independent allocation ceilings so a huge page cannot create an unbounded canvas even when custom zoom is used:

- maximum raster area: **16,000,000 pixels**;
- maximum raster width or height: **8,192 pixels**;
- device-pixel-ratio request: capped at **2×** and reduced further when required by the raster budgets;
- fit-width and fit-page scaling may go below the manual 50% zoom floor so oversized pages actually fit the available reader viewport.

The CSS reading geometry and raster resolution are intentionally separate. A custom zoom may create a large scrollable CSS page while the backing raster resolution is reduced to remain inside the allocation ceiling.

## Scheduling and cancellation contract

### EPUB

Existing P27 behavior remains mandatory:

- reader shell paints before the full reader module loads;
- whole-book location generation waits for idle/visible time;
- search opens its secondary EPUB lazily;
- large searches yield to the main thread and honor abort signals;
- idle work is cancelled on teardown.

### PDF

RR4 adds explicit render generations:

- a new render invalidates and cancels the previous render/text-layer work;
- a stale render may never commit page controls or progress after a newer page wins;
- superseded PDF.js cancellation errors are treated as expected cancellation, not reader failure;
- document search remains result-bounded and cooperatively yields;
- per-page search resources are cleaned after text extraction;
- document reset destroys loading/document resources and releases large canvas/text-layer allocations.

## Memory evidence

Chromium memory evidence uses `HeapProfiler.collectGarbage` and `Runtime.getHeapUsage` through CDP. The lifecycle test:

1. imports the 160-page deterministic PDF;
2. opens and closes the integrated reader once to establish a warmed baseline;
3. repeats reader open/close cycles;
4. forces garbage collection;
5. fails if used JavaScript heap grows by more than 96 MiB above the warmed baseline.

This does not measure native PDF.js worker/GPU memory on every operating system. The raster ceilings and explicit PDF.js teardown cover those resources structurally; RR2 physical sessions cover device-specific behavior.

## Release integration

Commands:

```bash
pnpm certify:performance
pnpm test:performance
```

`certify:performance` is part of permanent source certification. The dedicated **Performance Budget** workflow builds the exact branch and runs the controlled Chromium profile. Production deployment runs performance budgets after immutable media staging and cross-browser acceptance but before the GitHub Pages artifact can be uploaded.

## Failure evidence

A budget failure retains:

- Playwright trace;
- screenshot;
- video;
- HTML report;
- per-test attached JSON metrics.

Ordinary passing reader sessions generate no telemetry and upload no personal reading data.

## Exit criteria

RR4 is complete only when:

- deterministic large EPUB/PDF fixtures are present and source-certified;
- fit-mode PDF geometry is bounded on oversized pages;
- PDF raster dimensions and area stay inside hard limits;
- stale PDF rendering and search work are cancellable and cleaned up;
- controlled import/open/navigation/search timing budgets pass;
- repeated reader lifecycle heap growth remains within the 96 MiB ceiling;
- Quality, Browser Acceptance, Publication Compatibility, and Performance Budget workflows are green on the RR4 head;
- the production deployment workflow cannot upload Pages output before the RR4 budget gate succeeds.

RR4 does not claim physical low-end performance certification; that evidence remains owned by RR2.