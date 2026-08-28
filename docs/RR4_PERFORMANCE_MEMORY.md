# RR4 — Performance, Memory, and Large-Document Budgets

## Purpose

RR4 converts the reader’s existing scheduling and teardown architecture into an executable release contract. It measures real personal-book import and canonical EPUB/PDF reader journeys on a deliberately throttled Chromium profile, rejects major timing regressions, and checks retained-memory growth after repeated open/close cycles.

RR4 does not claim one universal speed for every computer or phone. Absolute CI thresholds are regression tripwires on a named synthetic profile. Physical sustained-session evidence remains separate under RR2.

## Low-end CI profile

The authoritative profile is stored in `performance/budgets.json`.

| Property | RR4 value |
| --- | --- |
| Browser | Playwright Chromium |
| Viewport | 390 × 844 CSS pixels |
| Device scale factor | 1 |
| Input | touch-capable mobile context |
| CPU throttling | 4× through Chromium DevTools Protocol |
| Network | local built Astro preview |
| Service worker | blocked for deterministic reader timing |
| Parallelism | one test worker |
| Evidence class | synthetic browser profile |

The profile is intentionally slower than an ordinary CI desktop. It is reproducible enough to catch large regressions, but it is not represented as Android, iPhone, Samsung Internet, Safari hardware, or the RR2 lower-performance physical device.

## Corpus classes

RR4 generates publication bytes deterministically when the test worker loads. Generated fixtures are never uploaded from a user library and no third-party book is committed.

| Fixture | Minimum structure | Purpose |
| --- | --- | --- |
| Small EPUB | 4 spine items | cold import/open baseline |
| Ordinary EPUB | 36 spine items | normal reading, repeated lifecycle, page turns |
| Large EPUB | 180 spine items | long search, location work, resume, cancellation |
| Image-heavy EPUB | 24 uncompressed SVG resources | image decode/layout and archive-write pressure |
| Long PDF | 180 pages with mixed sizes and rotation | PDF.js open, text layers, page turns, full search, resize, resume |

Each publication contains deterministic unique text so archive compression remains realistic and the late search token appears only in the final EPUB spine item or final PDF page.

## Published budgets

All thresholds below apply to the `chromium-low-end-ci` profile. The machine-readable file is authoritative.

### Import and first-readable content

| Journey | Budget |
| --- | ---: |
| Small EPUB import | 5,000 ms |
| Ordinary EPUB import | 9,000 ms |
| Large EPUB import | 18,000 ms |
| Image-heavy EPUB import | 18,000 ms |
| Long PDF import | 12,000 ms |
| Small EPUB first ready | 7,000 ms |
| Ordinary EPUB first ready | 11,000 ms |
| Large EPUB first ready | 20,000 ms |
| Image-heavy EPUB first ready | 20,000 ms |
| Long PDF first ready | 16,000 ms |

Import includes local compatibility inspection, SHA-256 identity, metadata extraction where applicable, and IndexedDB persistence. First ready ends only when the canonical reader reports usable content, not when navigation merely begins.

### Interaction, search, rotation, and resume

| Journey | Budget |
| --- | ---: |
| EPUB page-turn p95 | 1,800 ms |
| PDF page-turn p95 | 1,800 ms |
| EPUB search first progress | 7,000 ms |
| EPUB full search | 28,000 ms |
| PDF search first progress | 7,000 ms |
| PDF full search | 28,000 ms |
| Same-format resume ready | 11,000 ms |
| PDF portrait → landscape stable | 6,000 ms |
| Search cancellation | 1,500 ms |
| Navigation after search cancellation | 1,800 ms |

The search targets are placed at the end of the generated documents. A passing result therefore requires scanning the intended large-document path rather than returning an early match.

### Main-thread responsiveness

A measured reader journey must remain below all three limits:

- no more than 60 Long Task entries;
- no more than 22,000 ms cumulative Long Task duration;
- no individual Long Task above 3,000 ms.

Long Task evidence is browser-local and may be unavailable on engines that do not expose the API. The RR4 release profile is Chromium, where the observer is available. The existing EPUB reader also retains its local `data-reader-long-*` evidence.

## Runtime hardening

### EPUB search cancellation

Closing an active EPUB search now aborts the search-only EPUB scan, increments the operation revision so stale completion cannot update the UI, and presents `Search cancelled.`. A closed search panel no longer continues walking a 180-section book in the background.

The existing search engine still:

- loads one spine section at a time;
- unloads the section in `finally`;
- yields cooperatively at bounded section intervals;
- checks the `AbortSignal` before and after every yield;
- destroys its search-only EPUB book on reader teardown.

### PDF stale-render invalidation

Rapid page, zoom, fit, or resize changes can overlap asynchronous PDF.js work. RR4 makes expected cancellation an owned state:

- every render receives a monotonic generation number;
- prior canvas and text-layer tasks are cancelled before replacement;
- stale generations cannot publish page state;
- `RenderingCancelledException` is ignored only when cancellation or staleness is expected;
- every transient `PDFPageProxy` calls `cleanup()` after rendering or search extraction;
- the active generation is exposed through `data-pdf-render-generation` for regression evidence.

Unexpected render failures still reach the existing explicit PDF error/retry path.

### PDF search cancellation

Closing PDF search aborts the active scan, re-enables the submit control, and announces `Search cancelled.`. Starting another query or destroying the reader also aborts the previous controller. Each searched page is cleaned in `finally`, and the four-page cooperative yield remains in place.

## Memory methodology

RR4 measures retained growth rather than enforcing a fragile absolute heap ceiling.

1. Import one ordinary EPUB and one 180-page PDF.
2. Navigate to My Library and force Chromium garbage collection three times.
3. Record median `JSHeapUsedSize`, DOM `Nodes`, and `Frames` through CDP.
4. Perform six real reader open/close cycles, alternating EPUB and PDF.
5. Return to My Library after every cycle so page lifecycle teardown runs.
6. Force garbage collection three more times and record the median again.
7. Compare only positive growth.

Release limits:

| Metric | Maximum retained growth |
| --- | ---: |
| JavaScript heap | 48 MiB |
| DOM nodes | 900 |
| frames | 1 |

This journey exercises EPUB iframes, PDF canvases and text layers, PDF.js workers/documents, object URLs, observers, render tasks, search adapters, event listeners, and route-level `pagehide` cleanup. The growth test does not prove that every browser’s collector behaves identically; it blocks clear retained-resource regressions in the required CI profile.

## Commands

```bash
# Source ownership, budget schema, runtime invariants, and CI wiring
pnpm certify:performance

# Pure percentile, budget, and retained-growth regression tests
pnpm test:reader

# Build and run the throttled Chromium budget suite
pnpm build
pnpm test:performance
```

The dedicated `Performance Budget` workflow installs Chromium only, runs the full source/regression/build chain, executes the low-end profile, and retains traces, screenshots, video, metrics attachments, and the HTML report only on failure.

## Production gate

The deployment workflow runs RR4 after the complete Chromium/Firefox/WebKit browser acceptance suite and before `actions/upload-pages-artifact`. A failed performance or memory budget prevents publication of the GitHub Pages artifact.

Timing evidence is attached to the Playwright result as `rr4-performance-metrics.json`, allowing failed thresholds to be inspected without adding analytics or uploading user publication data.

## Failure policy

- **P0:** unbounded memory growth, page cannot close, navigation becomes permanently blocked, worker/document teardown failure that crashes subsequent readers, or personal-book data loss.
- **P1:** a required journey exceeds its budget, cancellation does not complete, stale PDF work replaces the requested page, or repeated use crosses a retained-memory limit.
- **P2:** a meaningful slowdown still below the release threshold or a profile-specific degradation with a usable workaround.
- **P3:** measurement/reporting polish that does not affect reader responsiveness.

RR4 thresholds may be deliberately revised only with a documented fixture/profile change and reviewed evidence. Raising a threshold solely to make a regression green is not valid completion.

## Evidence boundary

RR4 provides source evidence, deterministic Node regression, and a throttled Chromium browser profile. It does not replace RR2 named physical-device evidence, and it does not certify a 30–60-minute physical reading session, real thermal throttling, mobile memory pressure, browser process eviction, or OS background/resume behavior.

The RR2 lower-performance device must still complete sustained EPUB and PDF use on the exact release SHA. RR4 makes that campaign less likely to discover basic leaks or unbounded operations, but it cannot substitute for operating the device.
