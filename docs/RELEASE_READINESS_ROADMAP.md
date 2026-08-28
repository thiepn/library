# Ebook Reader Release-Readiness Roadmap

## Goal

Deliver a dependable, low-friction reading experience across a published browser/device matrix without claiming literal compatibility with every historical device, browser, embedded webview, malformed file, or DRM system.

The target is **v1.0**. A phase is complete only when implementation, executable checks, documentation, and honest evidence exist. Source checks, browser-engine automation, simulated device profiles, and physical-device operation are separate evidence classes and may not be substituted for one another.

## Release definition

The reader is release-ready only when:

- every required Chromium, Firefox, and WebKit browser project passes;
- every required named physical-device target has current evidence for the exact release SHA;
- supported EPUB/PDF classes open, navigate, resume, search, and fail safely;
- no unresolved P0 or P1 defect remains;
- accessibility, keyboard, touch, safe-area, zoom, reduced-motion, and forced-colors gates pass;
- low-end, large-book, long-session, offline, quota, update, and recovery behavior is bounded;
- progress, bookmarks, annotations, settings, activity, and imported books survive supported upgrades;
- untrusted publication content remains inside the reader security boundary;
- the exact source commit passes production deployment and live-media verification;
- support limits, recovery instructions, release notes, rollback steps, and a v1.0 tag exist.

Severity policy:

| Severity | Meaning | Release rule |
| --- | --- | --- |
| P0 | data loss, security failure, widespread crash, or reader cannot open | blocks every release |
| P1 | core reading, navigation, resume, import, accessibility, or exit path broken on a required target | blocks release |
| P2 | important degradation with a usable workaround | fix or explicitly accept before v1.0 |
| P3 | cosmetic or optional enhancement | may be scheduled after v1.0 |

## Phase 1 — Release contract and browser-engine acceptance baseline

**Purpose:** replace source-only confidence with executable user journeys in real browser engines.

Implementation:

- publish Tier 1, Tier 2, unsupported, device-class, input, and evidence boundaries;
- run deterministic Playwright acceptance in Chromium, Firefox, and WebKit;
- cover desktop and phone-sized projects;
- exercise catalog, My Library, real EPUB/PDF import, canonical readers, readiness, controls, dialogs, focus return, and overflow containment;
- reject unhandled page errors;
- retain trace, screenshot, video, and report artifacts only on failure;
- run Browser Acceptance as an independent CI signal.

Exit criteria:

- Quality and Browser Acceptance are green;
- browser fixtures require no hosted R2 media;
- roadmap/support claims and RR1 ownership are permanently source-certified.

## Phase 2 — Physical-device acceptance and evidence

**Purpose:** prove that actual devices, operating systems, browsers, input systems, and lifecycle behavior provide a smooth reading experience.

Implementation:

- define an authoritative physical matrix for Android Chrome, Samsung Internet, Firefox, a lower-performance Android phone, iPhone Safari, iPhone installed PWA, iPad Safari, Windows Edge/Chrome/Firefox, and macOS Safari/Chrome;
- define required portrait, landscape, split-view, narrow-window, touch, keyboard, pointer, trackpad, software-keyboard, native-selection, history, background/resume, offline/PWA, and sustained-session journeys;
- store evidence as versioned JSON records bound to an exact 40-character build SHA;
- require named human tester, physical manufacturer/model, OS/browser versions, required variants/inputs, journey outcomes, defects, duration, and evidence references;
- provide structural validation that accepts an incomplete campaign but rejects malformed or dishonest records;
- provide an exact-SHA release gate that fails until every target has current passing evidence;
- retain manual workflow summaries as release artifacts;
- provide structured physical-device defect intake.

Exit criteria:

- all required targets pass for one exact build SHA;
- every required journey and viewport/input variant passes;
- each selected record includes evidence and at least a 30-minute session;
- no open P0/P1 remains;
- `pnpm certify:physical:release -- --expected-sha <sha>` passes.

## Phase 3 — Publication-format compatibility and hostile-file handling

**Purpose:** handle real publication diversity rather than only ordinary reflowable samples.

EPUB scope:

- EPUB 2/3, reflowable and fixed-layout detection;
- nested navigation, landmarks, page lists, notes, internal/external links;
- images, SVG, tables, code, MathML, media fallbacks, embedded fonts, publisher CSS;
- LTR, RTL, CJK, and vertical-writing metadata;
- missing navigation, malformed package/spine/resource data, encrypted/DRM content, traversal, zip-bomb, remote-resource, and scripted-content attempts.

PDF scope:

- text, scanned/image-only, mixed sizes, rotation, large pages, fonts, forms, links, encryption/password protection, corrupt xref data, and incremental updates;
- explicit messaging when text selection/search is unavailable;
- cancellation and cleanup during failed or abandoned opens.

Exit criteria:

- supported fixtures have expected pass results;
- unsupported/hostile fixtures have bounded safe failures;
- no file class silently hangs or starts an unbounded operation.

## Phase 4 — Performance, memory, and low-end resilience

**Purpose:** make opening, reading, searching, and long sessions smooth on constrained hardware.

Implementation:

- define cold-open, warm-open, first-readable-page, page-turn, search, rotation, and resume budgets;
- measure small, ordinary, large, image-heavy, and long-document fixtures;
- profile EPUB location generation, PDF rendering/text layers, search, cover extraction, hashing, and IndexedDB writes;
- add cancellation, cooperative yielding, bounded queues, and stale-render invalidation;
- verify teardown of iframes, canvases, workers, object URLs, observers, render tasks, and listeners;
- repeat open/close, format-switch, background/resume, and 30–60-minute sessions on the lower-performance target;
- add stable regression thresholds where CI measurement is reliable.

Exit criteria:

- published budgets pass on the defined lower-performance profile;
- repeated use has bounded memory;
- long operations never prevent navigation, cancellation, or recovery.

## Phase 5 — Offline, PWA, update, and storage reliability

**Purpose:** keep books recoverable when connectivity or browser storage is unreliable.

Implementation:

- provide explicit download/remove state for exact hosted EPUB/PDF releases;
- expose offline inventory, size, progress, cancellation, and quota guidance;
- verify catalog, My Library, reader shell, and explicitly downloaded books after restart while offline;
- keep personal books in IndexedDB without service-worker duplication;
- test denied IndexedDB, quota exhaustion, blocked upgrades, interrupted writes, private mode, storage eviction, and multi-tab upgrades;
- certify service-worker waiting/activation, cache migration, stale cleanup, rollback, and active-reader preservation.

Exit criteria:

- explicitly downloaded supported formats reopen offline;
- failures become explicit session-only/unavailable states without corrupting existing data;
- update/cache migrations are reproducible and reversible.

## Phase 6 — Accessibility and inclusive reading

**Purpose:** make core reading usable without assuming sight, mouse input, precise touch, ordinary contrast, or Latin LTR text.

Implementation:

- complete a WCAG 2.2 AA audit across catalog, My Library, EPUB, PDF, dialogs, imports, failures, and offline states;
- certify keyboard operation, focus, containment/recovery, skip navigation, live regions, and exit;
- test VoiceOver on iPhone/macOS, TalkBack on Android, and NVDA on Windows;
- verify 200% zoom, 400% reflow, large text, forced colors, reduced motion, high contrast, and target spacing;
- harden RTL, CJK, vertical text, language metadata, hyphenation, and font fallback;
- document limitations accurately.

Exit criteria:

- no P0/P1 accessibility defect remains;
- complete import → open → read → search/bookmark → resume → exit works with keyboard and required screen-reader families.

## Phase 7 — Reading ergonomics and product UX polish

**Purpose:** remove real-world friction not visible in architecture tests.

Implementation:

- refine onboarding and browser-local storage explanations;
- make import, duplicate, unsupported-file, storage, and recovery states concise and actionable;
- audit tap zones, swipes, page keys, scroll mode, selection, annotations, search, bookmarks, fullscreen/PWA, rotation, and back behavior;
- prevent toolbars from hiding actions or covering content;
- audit typography, line length, spacing, themes, images, tables, notes, and chapter transitions on real screens;
- eliminate layout shift, accidental page turns, scroll jumps, trapped panels, and ambiguous loading states;
- convert all confirmed RR2 findings into fixed or explicitly accepted outcomes.

Exit criteria:

- moderated phone, tablet, and desktop task scripts complete without workaround;
- all confirmed UX P0/P1/P2 defects are fixed or validly dispositioned.

## Phase 8 — Data durability, migration, backup, and portability

**Purpose:** prevent browser-local reading state from becoming fragile or trapped.

Implementation:

- version every persisted schema and add deterministic forward-migration tests;
- cover crash/interruption, partial writes, corrupt records, storage denial, and multiple tabs;
- export and restore activity, favorites, EPUB/PDF progress, bookmarks, highlights/notes, settings, and personal-book metadata;
- optionally include personal book files only through an explicit encrypted archive choice;
- validate partial restore, duplicate identity, stale releases, corrupt archives, and quota failure;
- keep restore atomic and document the absence of automatic cloud sync.

Exit criteria:

- supported historical schemas migrate without authoritative-position loss;
- users can inspect, back up, and move state without database tools;
- failed restore never damages current state.

## Phase 9 — Security, privacy, and dependency hardening plus v1.0 launch

**Purpose:** certify safe publication processing and produce an operable, reversible v1.0.

Implementation:

- audit CSP, headers, iframe/worker boundaries, blob/object URLs, links, remote resources, and download paths;
- keep scripted EPUB content and PDF JavaScript disabled with executable proof;
- reject traversal, bombs, misleading signatures, oversized metadata/covers, and pathological decompression;
- audit dependency vulnerabilities, licenses, provenance, lock integrity, SBOM, and update policy;
- ensure CI artifacts never expose personal files or secrets;
- publish privacy/security/support/recovery/rollback documentation;
- perform the **Physical-device release candidate re-run** on the exact final commit;
- remove obsolete release infrastructure, enable protected gates, bump to `1.0.0`, write changelog, tag, deploy, verify production, and record rollback.

Exit criteria:

- no known high/critical shipped vulnerability;
- hostile fixture suite and all preceding gates pass;
- final exact-SHA physical evidence is current;
- tagged source and production artifacts verify;
- support, limitations, privacy, recovery, and rollback claims are public and accurate.

## Current state

RR1 is implemented on its release branch. RR2 now provides the matrix, schema, validator, workflow, defect form, and documentation required to collect honest physical-device evidence. The current evidence count remains **0/12**; physical certification is not claimed until the named devices are actually operated and the exact-build gate passes.
