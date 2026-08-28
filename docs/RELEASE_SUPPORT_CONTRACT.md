# Reader Release Support Contract

This contract defines what “smooth on any device” means. Literal support for every device, browser, operating system, embedded webview, malformed file, and DRM scheme cannot be verified. The product instead maintains explicit support tiers, graceful failure rules, and distinct evidence categories.

A listed target is a **certification target**, not automatically a certified claim. Physical support is claimed only for the exact build covered by passing records.

## Tier 1 — release-blocking targets

At release-candidate time, certify current stable browser generations on the following physical environments:

| Platform | Browser environment | Required paths |
| --- | --- | --- |
| Windows desktop/laptop | Edge, Chrome, Firefox | catalog, import, EPUB, PDF, keyboard/pointer, resize, persistence, history, background/resume |
| macOS desktop/laptop | Safari, Chrome | catalog, EPUB, PDF, keyboard/trackpad, resize, persistence, history, background/resume |
| Android phone | Chrome, Samsung Internet, Firefox | import, EPUB, PDF, touch, native selection, software keyboard, rotation, back behavior, background/resume |
| lower-performance Android phone | Chrome, physical hardware at or below the matrix memory limit | full Android core journeys plus sustained-session observation |
| iPhone | Safari browser and installed standalone PWA | import, EPUB, PDF, safe areas, selection, keyboard, rotation, lifecycle, offline/PWA |
| iPad | Safari | portrait, landscape, split view, touch, EPUB pagination, PDF fit modes, lifecycle |

The automated engine baseline uses Chromium, Firefox, and WebKit on Linux. It is browser-engine evidence only and complements rather than replaces named physical-device evidence.

## Tier 2 — best-effort compatible targets

Current standards-compliant environments sharing a Tier 1 engine should generally work, but are release-blocking only when the same defect affects a Tier 1 path or no usable fallback exists:

- Brave, Vivaldi, Opera, and other Chromium derivatives;
- ChromeOS;
- current Linux desktop Chromium and Firefox distributions;
- Android tablets not represented by the phone/iPad matrix;
- embedded browser tabs exposing the required IndexedDB, Blob, Worker, Canvas, and Web Crypto capabilities.

## Unsupported or explicitly limited

- Internet Explorer and obsolete pre-modern engines;
- DRM-protected content requiring a vendor license service;
- scripted EPUB content: publication JavaScript remains disabled;
- automatic account-based cloud synchronization;
- files above the documented import limit;
- environments disabling required IndexedDB, Blob URL, Web Crypto, Canvas, Worker, or storage APIs;
- corrupt, hostile, unsupported, or encrypted files outside the documented EPUB/PDF scope.

Unsupported content must fail with bounded, understandable messaging and must not corrupt unrelated library state.

## Device classes

Automated profiles and physical evidence collectively cover:

- minimum-width phone near 320 CSS pixels;
- ordinary phone near 360–430 CSS pixels;
- short landscape phone;
- lower-performance/low-memory phone;
- tablet portrait, landscape, and split view;
- narrow desktop window and ordinary desktop/laptop window;
- high-DPI displays;
- pointer, trackpad, touch, keyboard, native selection, software keyboard, and assistive-technology input.

## Core acceptance journeys

Every required physical target runs the journeys assigned in `evidence/physical-devices/matrix.json`, including as applicable:

1. Navigate catalog, book details, and My Library without blocked controls or horizontal document overflow.
2. Start, navigate, close, and resume a hosted EPUB for the exact release.
3. Change EPUB layout, typography, geometry, and theme without losing the usable position.
4. Use EPUB contents, search, bookmarks, highlights, and notes.
5. Start, navigate, close, and resume a hosted PDF.
6. Use PDF search, page bookmarks, fit modes, and zoom.
7. Import and reopen a valid personal EPUB and PDF without upload or duplicate cards.
8. Exercise target-required rotation, split view, narrow windows, safe areas, and browser chrome.
9. Exercise software-keyboard or physical-keyboard/dialog behavior.
10. Use native selection, browser/OS history, background/lock, and resume behavior.
11. Verify installed-PWA/offline behavior where required.
12. Complete at least the configured sustained-session duration.

## Physical-device certification requirements

A passing physical record requires:

- a target ID from the authoritative matrix;
- a named human tester;
- physical manufacturer and model;
- exact OS and browser versions;
- the **exact 40-character build SHA** and tested HTTPS URL;
- every target-required input, viewport variant, and journey;
- at least one non-sensitive evidence reference;
- the configured sustained-session duration;
- no open P0 or P1 defect.

**No placeholder, emulator, simulator, or device profile counts** as physical evidence. A record tied to another build SHA cannot certify the candidate. Evidence also has a configured **maximum age**, currently 90 days, and the final release candidate receives a fresh exact-build run.

The structural gate may pass while the campaign is incomplete; it validates honesty and shape, not coverage. Only the exact-build release gate may emit a physical-device release pass.

## Release gates

A v1.0 release requires all of the following:

- `Quality`: strict TypeScript/content validation, source certification, reader regressions, production build, and post-build checks;
- `Browser Acceptance`: Playwright Chromium, Firefox, and WebKit projects;
- `Physical Device Evidence`: all required named targets pass for the exact candidate SHA;
- publication-format and hostile-file matrix;
- performance and memory budgets;
- accessibility/manual assistive-technology evidence;
- offline, update, storage, migration, and recovery evidence;
- security, privacy, dependency, and license review;
- exact-source production deployment and live-media verification;
- zero unresolved P0/P1 issues.

## Evidence language

Use these statements precisely:

- **Source-certified:** static ownership and invariant checks passed.
- **Browser-engine certified:** Playwright projects passed in Chromium, Firefox, and WebKit.
- **Device-profile certified:** deterministic viewport, orientation, safe-area, touch, and keyboard-state profiles passed.
- **Physical-device certified:** a named person operated a named physical device/OS/browser against an exact build and a passing evidence record exists.
- **Production-verified:** the exact deployed source and live canonical artifacts passed production verification.

Do not replace one category with another. “WebKit passed” must not be reported as “tested on iPhone,” and a responsive desktop viewport must not be reported as a physical mobile run.

## Current certification status

RR1 browser-engine infrastructure exists on its release branch. RR2 physical evidence infrastructure is implemented, but the current physical matrix remains **0/12**. Therefore no broad physical-device certification is currently claimed.
