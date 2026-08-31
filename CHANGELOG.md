# Changelog

All notable changes to Thiepn Library are recorded here.

## Unreleased

No post-v1 changes are recorded yet.

## 1.0.0 — 2026-08-31

### Reader

- Added the integrated EPUB reader with paginated and scrolling modes, single/double/auto spreads, typography controls, contents navigation, in-book search, bookmarks, highlights/notes, progress restoration, keyboard navigation, desktop page rails, touch/swipe navigation, and native-selection safeguards.
- Added the integrated PDF reader with selectable text, previous/next/direct page navigation, page rails, fit-width/fit-page/custom zoom, search, bookmarks, progress restoration, mobile gestures, and recovery to the original PDF.
- Added persistent reading state, migration/fallback handling, personal EPUB/PDF import and reopen flows, and cross-format reader entry routing.
- Added regression coverage for mobile/desktop interaction ownership, tap zones, wheel/trackpad pagination, viewport adaptation, reading progress, search, bookmarks, annotations, and reader recovery.

### Reliability, accessibility, and performance

- Added offline/PWA reopening, storage reliability, update recovery, data durability, backup/portability, and conflict-handling acceptance gates.
- Added cross-engine accessibility and inclusive-reading acceptance plus keyboard/focus/dialog ownership checks.
- Added reading-ergonomics and performance/memory budgets for sustained reader use and production staging.
- Added the 12-target RR10 physical-device evidence framework; physical hardware certification remains a separate release gate and is not implied by this metadata preparation.

### Security

- Added deny-by-default EPUB frame CSP and render-time remote-resource stripping.
- Added explicit EPUB metadata, cover, and deep-inspection size limits.
- Expanded remote EPUB resource detection to `srcset` and SVG references.
- Expanded PDF active-action rejection while keeping PDF.js evaluation disabled.
- Added deployable application CSP/no-referrer policy and live production verification.
- Added high/critical production dependency audit, production license inventory, deterministic CycloneDX SBOM generation, minimum package release age, and full-SHA GitHub Action provenance.
- Removed obsolete privileged L17B recovery and bootstrap workflows.

### Privacy and support

- Published explicit Privacy, Security, and Support boundaries.
- Documented manual backup/personal-file boundaries and absence of automatic cloud sync, behavioral analytics, and advertising.

### Release operations

- Added exact live `release-identity.json` source verification.
- Replaced post-deploy commits to `main` with immutable deployment evidence so protected-main enforcement does not require a deployment-bot bypass.
- Added a fail-closed v1 release workflow and gate.
- Added immutable two-SHA final certification: one frozen application source SHA plus a descendant record-only physical-evidence SHA.
- Final `v1.0.0` tagging remains blocked until `main` is protected and the required exact-SHA physical-device campaign reaches 12/12. Package/changelog version metadata alone is not a release claim.
