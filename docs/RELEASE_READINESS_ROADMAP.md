# Ebook Reader Release-Readiness Roadmap

## Goal

Deliver a dependable, low-friction reading experience across the supported browser and device classes without claiming literal compatibility with every historical browser, device, file, or DRM system.

The release target is **v1.0**. A phase is complete only when its implementation, regression coverage, documentation, and release evidence are all present. A green build alone is not sufficient.

## Release definition

The reader is release-ready when all of the following are true:

- every Tier 1 browser engine passes the automated acceptance matrix;
- the physical-device matrix has recorded evidence rather than simulated-only claims;
- supported EPUB and PDF fixture classes open, navigate, resume, search, and fail safely;
- no open P0 or P1 reader defect remains;
- accessibility, keyboard, touch, safe-area, zoom, reduced-motion, and forced-colors gates pass;
- large-book, low-memory, offline, quota, update, and recovery scenarios have bounded behavior;
- local progress, bookmarks, annotations, settings, and imported books survive supported upgrades;
- untrusted publications cannot enable scripted EPUB content or escape the reader security boundary;
- production deployment and live-media verification pass from the exact release commit;
- release notes, support limits, recovery instructions, rollback steps, and the v1.0 tag exist.

Severity policy:

| Severity | Meaning | Release rule |
| --- | --- | --- |
| P0 | data loss, security boundary failure, reader cannot open, or widespread crash | blocks every merge and release |
| P1 | core reading, navigation, resume, import, or accessibility path broken on a Tier 1 target | blocks release |
| P2 | important degradation with a usable workaround | must be explicitly accepted or fixed before v1.0 |
| P3 | polish or optional enhancement | may be scheduled after v1.0 |

## Phase 1 — Release contract and browser-engine acceptance baseline

**Purpose:** replace source-only confidence with executable user-journey coverage in real browser engines.

Implementation:

- define Tier 1, Tier 2, unsupported, device-class, input, and evidence boundaries;
- add Playwright acceptance tests for Chromium, Firefox, and WebKit;
- cover desktop and phone-sized contexts;
- verify catalog → My Library navigation;
- import deterministic local EPUB and PDF fixtures through the real file input;
- open both canonical personal-reader routes;
- verify reader readiness, primary controls, dialog ownership, focus return, and horizontal-layout containment;
- fail on unhandled page errors;
- retain traces, screenshots, and video only on failure;
- run browser acceptance as an independent required CI signal.

Exit criteria:

- Quality workflow green;
- Browser Acceptance workflow green for all configured projects;
- release support contract and roadmap permanently source-certified;
- no hosted R2 asset is required for the fixture-based acceptance paths.

## Phase 2 — Publication-format compatibility and hostile-file handling

**Purpose:** prove that the reader handles the real variety of books rather than only ordinary reflowable samples.

EPUB matrix:

- EPUB 2 and EPUB 3;
- reflowable and fixed-layout publications;
- nested navigation, landmarks, page lists, footnotes, endnotes, internal and external links;
- large images, SVG, tables, code, MathML, audio/video fallbacks, embedded fonts, and publisher CSS;
- left-to-right, right-to-left, CJK, and vertical-writing metadata;
- missing navigation, malformed package metadata, broken spine entries, missing resources, encrypted/DRM content, and zip-bomb/path-traversal attempts;
- remote-resource and scripted-content rejection.

PDF matrix:

- ordinary text PDFs, scanned/image-only PDFs, mixed page sizes, rotated pages, large dimensions, embedded fonts, forms, links, encrypted/password-protected PDFs, corrupt xref data, and incremental updates;
- graceful messaging when selectable text or search is unavailable;
- cancellation and cleanup during failed or abandoned opens.

Exit criteria:

- every supported fixture has an expected pass result;
- every unsupported/hostile fixture has an expected safe-failure result;
- no file class can silently hang the UI or create an unbounded resource operation.

## Phase 3 — Performance, memory, and low-end-device resilience

**Purpose:** make long sessions and large books smooth on constrained hardware.

Implementation:

- define cold-open, warm-open, page-turn, search, rotation, and resume budgets;
- measure representative small, medium, large, image-heavy, and long-document fixtures;
- profile EPUB location generation, PDF rendering, text-layer creation, whole-book search, cover extraction, hashing, and IndexedDB writes;
- add cancellation, cooperative yielding, bounded queues, and stale-render invalidation where missing;
- verify no retained reader, iframe, canvas, worker, object URL, observer, or event-listener leaks after repeated open/close cycles;
- reduce main-thread stalls on low-core and throttled profiles;
- add performance regression thresholds that are stable enough for CI.

Exit criteria:

- budgets pass on the defined low-end profile;
- repeated open/close and format-switch loops show bounded memory;
- no long operation prevents back navigation, cancellation, or reader recovery.

## Phase 4 — Offline, PWA, update, and storage reliability

**Purpose:** ensure books remain readable when connectivity or browser storage is unreliable.

Implementation:

- cache explicitly requested hosted EPUB and PDF editions with exact-release identity;
- provide visible offline/download state and removal controls;
- verify catalog, My Library, saved reader shell, and downloaded books offline;
- preserve personal books offline through IndexedDB without service-worker duplication;
- add storage estimation, persistence state, quota warnings, and actionable recovery copy;
- test private mode, denied IndexedDB, quota exhaustion, blocked upgrades, interrupted writes, and multi-tab upgrades;
- certify service-worker update, waiting-worker activation, cache migration, stale-cache cleanup, and rollback behavior;
- prevent an update from discarding an open reader session.

Exit criteria:

- downloaded books reopen offline after a full browser restart;
- failures degrade to explicit session-only or unavailable states without corrupting existing data;
- update and cache migrations are reproducible and reversible.

## Phase 5 — Accessibility and inclusive reading

**Purpose:** make core reading usable without assuming sight, mouse input, precise touch, ordinary contrast, or Latin left-to-right text.

Implementation:

- complete WCAG 2.2 AA audit of catalog, My Library, EPUB, PDF, dialogs, import, errors, and offline states;
- certify keyboard-only operation, visible focus, focus order, focus containment, skip navigation, live regions, and reader exit;
- test VoiceOver/Safari, TalkBack/Chrome, NVDA/Firefox or Chromium, and platform zoom/text scaling;
- verify 200% browser zoom and 400% reflow where applicable;
- test forced colors, reduced motion, high contrast, coarse pointer, switch-like sequential navigation, and touch target spacing;
- verify semantic reading order and usable alternative text behavior;
- harden RTL, CJK, vertical text, language metadata, hyphenation, and font fallback;
- document unsupported accessibility limitations rather than hiding them.

Exit criteria:

- no P0/P1 accessibility defect remains;
- the complete import → open → read → search/bookmark → resume → exit path works with keyboard and at least one screen reader per mobile/desktop family.

## Phase 6 — Reading ergonomics and product UX polish

**Purpose:** remove friction that is not visible in architecture tests.

Implementation:

- refine first-run onboarding and explain browser-local storage clearly;
- make import, duplicate, unsupported-file, storage, and recovery states concise and actionable;
- validate tap zones, swipes, page keys, scroll mode, selection, annotations, search, bookmarks, fullscreen/PWA, rotation, and browser back behavior;
- ensure toolbars neither hide necessary actions nor cover content;
- make settings discoverable while preserving a quiet reading surface;
- add a storage/download manager and clearer book-state actions;
- audit typography, line length, spacing, theme contrast, image handling, tables, footnotes, and chapter transitions on real screens;
- eliminate layout shift, accidental page turns, scroll jumps, trapped panels, and unclear loading states.

Exit criteria:

- moderated task scripts complete without workaround on phone, tablet, and desktop;
- all confirmed UX defects from the physical-device matrix are fixed or explicitly deferred as P3.

## Phase 7 — Data durability, migration, and portability

**Purpose:** prevent the browser-local model from becoming a data trap.

Implementation:

- version every persisted schema and add deterministic forward-migration tests;
- export and restore progress, activity, favorites, EPUB bookmarks, highlights/notes, PDF bookmarks, settings, and personal-book metadata;
- support an optional encrypted archive that may include personal book files when the user explicitly selects it;
- validate partial restore, duplicate identity, stale release, corrupt archive, and quota failure behavior;
- keep import atomic so a failed restore does not damage current state;
- document that automatic cross-device sync is not provided unless a later privacy-preserving sync service is intentionally added.

Exit criteria:

- a user can move or back up their library state without database tools;
- all supported historical schemas migrate without loss of authoritative format-native positions.

## Phase 8 — Security, privacy, and dependency hardening

**Purpose:** certify the reader as a safe local-file and hosted-publication processor.

Implementation:

- audit CSP, security headers, iframe boundaries, workers, blob URLs, object URLs, external links, remote resources, and download paths;
- retain `allowScriptedContent: false` and add executable proof that EPUB scripts do not run;
- reject zip bombs, traversal paths, misleading extensions, invalid MIME signatures, oversized metadata/cover assets, and pathological decompression ratios;
- keep PDF JavaScript evaluation disabled;
- audit dependencies, licenses, provenance, known vulnerabilities, update cadence, and lockfile integrity;
- ensure traces and CI artifacts never contain personal files or secrets;
- publish a concise privacy and security model plus a responsible-reporting route.

Exit criteria:

- no known high/critical vulnerability affects the shipped path;
- hostile fixture suite passes;
- privacy claims match actual network and storage behavior.

## Phase 9 — Physical-device release candidate and v1.0 launch

**Purpose:** convert automated confidence into release evidence and an operable v1.0.

Minimum physical matrix:

- Android phone: Chrome and Samsung Internet;
- iPhone: Safari browser and installed PWA;
- iPad: Safari portrait, landscape, and split view;
- Windows: Chrome/Edge and Firefox;
- macOS: Safari and Chrome/Firefox where available;
- one low-memory or older supported phone;
- keyboard, touch, mouse/trackpad, and screen-reader paths.

Implementation:

- run the complete acceptance script with recorded device/OS/browser/build evidence;
- burn down all P0/P1 and accepted P2 defects;
- repeat offline, update, quota, backup/restore, and long-session tests;
- perform final legal/license, privacy, metadata, icon, installability, and documentation review;
- remove obsolete release branches/workflows and enable protected release gates;
- bump from release candidate to `1.0.0`, write changelog and support notes, tag the exact deployed commit, verify production, and record rollback instructions.

Exit criteria:

- every Tier 1 target has recorded passing evidence;
- production verification passes from the tagged source;
- the support contract, known limitations, recovery documentation, and rollback path are public and accurate.

## Current state

Phase 1 is the active implementation phase. ER0–ER7 provide a strong reader foundation, but they do not replace cross-browser end-to-end execution, broader publication fixtures, performance budgets, data portability, hostile-file testing, or recorded physical-device evidence.
