# Reader Release Support Contract

This contract defines what “smooth on any device” means for a release. Literal support for every device, browser, operating system, malformed file, and DRM scheme is impossible to verify. The product instead maintains explicit supported tiers, graceful fallback rules, and evidence requirements.

## Tier 1 — release-blocking targets

At release-candidate time, certify the current and immediately previous stable generation where practical for:

| Platform | Browser family | Required paths |
| --- | --- | --- |
| Windows desktop/laptop | Chromium-based Chrome or Edge; Firefox | catalog, import, EPUB, PDF, keyboard, resize, persistence, offline/downloaded reading |
| macOS desktop/laptop | Safari; Chromium; Firefox | catalog, EPUB, PDF, keyboard/trackpad, persistence, offline/downloaded reading |
| Android phone/tablet | Chrome | import, EPUB, PDF, touch, keyboard, rotation, back behavior, PWA/offline |
| iPhone | Safari and installed PWA | import, EPUB, PDF, safe areas, selection, software keyboard, rotation, offline |
| iPad | Safari | portrait, landscape, split view, keyboard/touch, EPUB pagination, PDF fit modes |

The automated engine baseline uses Chromium, Firefox, and WebKit on Linux to catch rendering-engine regressions. It complements rather than replaces physical-device evidence.

## Tier 2 — best-effort compatible targets

These targets should work when they share a modern standards-compliant engine, but a defect is release-blocking only when it also affects a Tier 1 path or has no reasonable fallback:

- Samsung Internet;
- Brave, Vivaldi, Opera, and other current Chromium derivatives;
- Firefox for Android;
- ChromeOS;
- current Linux desktop Chromium and Firefox distributions;
- embedded browser tabs that expose the necessary IndexedDB, Blob, Worker, and Web Crypto capabilities.

## Unsupported or explicitly limited

- Internet Explorer and obsolete pre-modern browser engines;
- DRM-protected EPUB/PDF content requiring a vendor license service;
- scripted EPUB content: publication JavaScript remains disabled;
- automatic account-based or cloud cross-device synchronization;
- files above the documented local import limit;
- environments that disable IndexedDB, Blob URLs, Web Crypto, canvas, workers, or required storage APIs;
- files whose structure is corrupt, hostile, encrypted without supplied support, or outside the documented EPUB/PDF scope.

Unsupported content must fail with a bounded, understandable message and must not corrupt existing library state.

## Device classes

Automated and physical evidence must cover:

- minimum-width phone around 320 CSS pixels;
- ordinary phone around 360–430 CSS pixels;
- short landscape phone;
- tablet and split-window tablet;
- narrow desktop window;
- ordinary desktop/laptop;
- high-DPI display;
- low-memory or older supported phone;
- pointer, touch, keyboard, and assistive-technology input.

## Core acceptance journeys

Every Tier 1 target must pass:

1. Open the catalog and navigate to My Library without horizontal overflow or blocked controls.
2. Import a valid personal EPUB and PDF.
3. Reject an unsupported or corrupt file without damaging existing books.
4. Open EPUB, navigate, change appearance/layout, search, bookmark, annotate, close, and resume.
5. Open PDF, navigate, zoom/fit, search, bookmark, close, and resume.
6. Rotate or resize while preserving a usable position and reachable controls.
7. Open and close dialogs with touch and keyboard; restore focus correctly.
8. Leave and return using browser back/forward without a dead reader or lost state.
9. Reopen downloaded/saved content offline where that format is explicitly available offline.
10. Recover from a failed open, storage denial, interrupted update, or unavailable network without silent data loss.

## Release gates

A v1.0 release requires all of these signals:

- `Quality`: strict TypeScript/content validation, source certification, reader regressions, production build, and post-build checks;
- `Browser Acceptance`: Playwright Chromium, Firefox, and WebKit desktop/phone projects;
- publication-format fixture matrix;
- performance and memory budgets;
- accessibility evidence;
- security and hostile-file suite;
- recorded physical-device acceptance matrix;
- exact-source production deployment and live-media verification;
- zero unresolved P0/P1 issues.

## Evidence language

Use these statements precisely:

- **Source-certified:** static ownership and invariant checks passed.
- **Browser-engine certified:** Playwright projects passed in Chromium, Firefox, and WebKit.
- **Device-profile certified:** deterministic viewport, orientation, safe-area, touch, and keyboard-state profiles passed.
- **Physical-device certified:** a named device/OS/browser/build was operated and recorded.
- **Production-verified:** the exact deployed source and live canonical artifacts passed production verification.

Do not replace one category with another in release claims.
