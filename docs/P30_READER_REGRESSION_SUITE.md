# P30 — Reader Regression Suite

P30 establishes a permanent regression gate for the Library reader stack after the P29 compatibility bridge.

## Purpose

The reader now spans EPUB opening, nested navigation, pagination/scroll modes, appearance and layout reflow, CFI resume, progress, search, bookmarks, annotations, responsive behavior, accessibility, migration, fallback, performance, offline/PWA behavior, and the preserved Markdown compatibility reader. Source certification alone is not sufficient to detect behavioral regressions across those boundaries.

P30 adds deterministic executable tests without coupling qualification to current book titles or requiring a browser download in ordinary CI.

## Layer 1 — ReaderController behavioral regression

`scripts/regression/reader-core.test.ts` runs the real `ReaderController` against a deterministic `FakeReaderEngine`.

Covered invariants include:

- successful open → ready state and native nested TOC exposure;
- invalid saved target → safe first-display recovery;
- EPUB CFI navigation remains separate from href navigation;
- previous/next commands stay behind the controller boundary;
- layout reflow preserves exact current CFI unless explicitly disabled;
- appearance reflow preserves CFI while in-place theme changes do not force redisplay;
- generated and loaded location maps enrich percentage without replacing CFI identity;
- selection and interaction events cross the engine/controller boundary exactly once;
- engine failures normalize to the stable reader error contract;
- destroy is idempotent and destroyed controllers reject further commands.

The fake engine uses only synthetic fixture identities and does not encode any current Library title.

## Layer 2 — Migration and fallback behavioral regression

`scripts/regression/reader-migration-fallback.test.ts` exercises the real migration and failure-description functions with synthetic publications.

It protects:

- active eligible EPUB release precedence;
- legacy Markdown fallback when EPUB is unavailable;
- explicit unavailable state when neither reading path exists;
- exact edition/release identity propagation;
- same-origin localization of canonical Library media;
- preservation of noncanonical release-authoritative artifact URLs;
- P26 network/publication/rendering/location/reader/unknown failure classes;
- retryability rules, including non-retryable invalid-container failures.

## Layer 3 — Built route regression

`scripts/regression/reader-postbuild.mjs` runs after the static site has been built.

It walks every public web-readable work dynamically from source metadata rather than using a title allowlist. For each eligible work it verifies the built canonical `/read` route and then walks all historical chapter pages.

The post-build layer protects:

- native reader shell output for active EPUB releases;
- saved-position legacy launcher output when Markdown remains primary;
- P29 legacy chapter identity attributes;
- P29 compatibility banner and `Open current reader` bridge for migrated books;
- P29 `noindex,follow` plus canonicalization of migrated historical pages;
- prevention of accidental compatibility demotion for Markdown-primary works;
- continued presence of P28 service-worker and offline recovery assets.

## CI and release policy

`pnpm test:reader` runs before the build in the Quality workflow.

`pnpm test:reader:postbuild` runs after the normal post-build certification.

`pnpm release:certify` includes both layers, so production deployment cannot bypass P30.

P30 does not replace the existing phase certifications, content validation, immutable-artifact verification, or production verification. It adds behavioral execution between those contracts.

## Why no heavyweight browser framework in P30

P30 intentionally uses Node's built-in test runner with the repository's existing `tsx` toolchain. The goal is deterministic high-signal regression on every pull request without introducing browser downloads, browser-version drift, or a second test ecosystem solely for this phase.

This does not claim cross-browser certification. Browser-specific rendering, input, iframe, viewport, and compatibility validation belongs to **P31 — Cross-Browser Certification**.

P30 therefore provides a stable automation floor; P31 adds the real-browser matrix above it.

## Failure policy

Any failing P30 test blocks Quality and release certification. Tests may be updated only when a later phase intentionally changes the protected contract; the corresponding phase documentation and certification must explain why the old invariant is no longer correct.
