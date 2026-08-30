# RR7 — Reading Ergonomics & Product UX Polish

## Campaign goal

Close reader-facing friction that remains after the RR1–RR6 architecture, compatibility, performance, offline, and accessibility gates. RR7 is a product-UX certification phase, not a new reader architecture.

Automated browser/device-profile checks are valid code evidence. They are **not** a substitute for physical-device operation; physical-device release evidence remains tracked separately.

## Audit surface

### EPUB

- left/right page-turn zones and center chrome toggle
- swipe, keyboard, footer buttons, and desktop page rails
- protected links, form controls, text selection, and annotations
- paginated ↔ scrolled mode transitions
- chapter-boundary and start/end behavior
- toolbar reveal/hide without content jumps
- Contents, appearance, search, saved/bookmark flows
- portrait, landscape, narrow window, split view, and resize

### PDF

- previous/next navigation and page entry
- fit-width/fit-page/zoom controls
- search and saved/bookmark dialogs
- keyboard and pointer/touch interaction
- software-keyboard, portrait/landscape, and compact-height behavior
- reader exit/back and resume

### Product states

- import, duplicate import, unsupported file, storage denial/quota, offline unavailable, and recovery messaging
- browser-local/personal-file explanations
- loading/readiness states that always distinguish working, blocked, failed, and recoverable conditions

## Severity policy

- **P0:** data loss, security failure, widespread crash, reader cannot open.
- **P1:** core reading/navigation/resume/import/accessibility/exit path broken on a required target.
- **P2:** important degradation with a usable workaround; fix or explicitly accept before v1.0.
- **P3:** cosmetic or optional enhancement; may move post-v1.0.

## Automated acceptance required for RR7

1. EPUB pointer/touch navigation remains one-command-per-gesture across Chromium, Firefox, and WebKit.
2. Paginated mode exposes obvious previous/next controls on fine-pointer desktop while preserving content click/tap zones.
3. Scrolled mode removes page-turn affordances and leaves native scrolling/selection untouched.
4. Links, interactive publication content, and active text selections never trigger a page turn.
5. Chrome visibility changes never cause the reading position to jump.
6. Reader mode changes preserve authoritative format-native progress.
7. Narrow-phone and compact-landscape controls stay reachable without covering reading content.
8. PDF search/saved panels remain dismissible, focus-contained, and viewport-safe.
9. Exit/back flows return without trapping focus or losing saved progress.
10. User-facing failure states identify the next useful recovery action.

## Physical-device acceptance still required

RR7 can close code-level P0/P1/P2 findings through deterministic evidence, but the following must still be operated on actual hardware before v1.0 physical certification:

- Android Chrome and Samsung Internet
- iPhone Safari or installed PWA
- iPad Safari
- Windows Chromium/Firefox
- lower-performance Android sustained session

Record defects against the exact release SHA and keep the physical matrix authoritative.

## Exit criteria

RR7 is complete only when:

- all automated reader/product UX journeys pass on the supported browser-engine matrix;
- every confirmed automated P0/P1/P2 finding is fixed or explicitly dispositioned;
- the moderated phone/tablet/desktop task script is documented and ready for human operation;
- physical-device evidence is either current for the release SHA or explicitly remains a release blocker rather than being inferred from emulation.
