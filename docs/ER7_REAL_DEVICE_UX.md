# ER7 — Real-Device Reader UX, Visual Polish & Product Certification

ER7 closes device-facing defects across the native EPUB reader, integrated PDF reader, and legacy web compatibility reader. It does not add a new reading format or alter format-native progress identity.

## Delivered scope

- Keep EPUB Contents, appearance, and reading-mode controls reachable at narrow phone widths.
- Give the integrated PDF reader a visual-viewport controller for phone, compact-height, orientation, touch, and software-keyboard state.
- Make PDF safe-area geometry additive to toolbar rows instead of allowing notch padding to overflow fixed grid tracks.
- Preserve a 44px coarse-pointer target floor for primary reader controls.
- Keep PDF Search and Saved entry points reachable on narrow phones.
- Treat PDF search and bookmark panels as owned dialogs with expanded state, backdrop dismissal, inert background content, focus containment, and Escape handling.
- Close a PDF search panel before navigating to a selected result.
- Compact PDF controls into one horizontally scrollable row on low-height landscape devices.
- Add safe-area and touch-target remediation to the legacy web reader.
- Reframe repository documentation around the public ebook library/reader product while retaining publication ingestion as maintenance infrastructure.

## Deterministic device-profile coverage

The regression and source-certification layers cover these geometry classes:

| Profile | Representative viewport | Primary risk |
| --- | ---: | --- |
| Minimum supported phone | 320 × 568 | Reader actions competing for toolbar width |
| Small Android portrait | 360 × 800 | Touch targets and panel width |
| Modern iPhone portrait | 390 × 844 | Safe areas and visual viewport |
| Large Android portrait | 412 × 915 | Browser chrome versus keyboard detection |
| Compact Android landscape | 740 × 360 | Excessive fixed chrome height |
| Modern phone landscape | 844 × 390 | Compact controls and orientation reset |
| Tablet / split window | 768 × 1024 and narrow desktop windows | Reader continuity without phone-only assumptions |
| Desktop | 1440 × 900 | No regression to pointer/keyboard workflows |

The pure device-state regression verifies keyboard contraction only when an editable control is focused, rejects minor browser-chrome movement below the threshold, resets stale orientation baselines, and distinguishes narrow phones from short landscape tablets.

## Certification boundary

Automated certification validates source ownership, deterministic device-profile state, responsive CSS invariants, build output, and the existing reader regression chain. It is not evidence that a human physically operated every target phone or browser.

A physical-device pass must not be represented as completed unless the following evidence is recorded from actual hardware:

1. Android Chromium: import/open/resume for EPUB and PDF, portrait and landscape, Search keyboard open/close, and back navigation.
2. iPhone Safari or installed PWA: notch/home-indicator clearance, text selection, appearance sheet, PDF Search, and orientation recovery.
3. iPad Safari: split view, rotation, EPUB pagination, PDF fit-width/fit-page, and bookmark panels.
4. Desktop Chromium and Firefox: keyboard navigation, focus containment, resize, reader exit, and persisted resume.

Until such evidence exists, the accurate release statement is **device-profile certified with physical-device verification pending**, not “tested on real devices.”

## Non-regression invariants

- EPUB CFIs, PDF pages, legacy web positions, bookmarks, and annotations remain independent authoritative state.
- No cross-format position translation is introduced.
- Hosted and personal PDF sources continue to use the same PDF runtime.
- Personal files remain browser-local.
- Device adaptation records no telemetry and performs no network synchronization.
- Existing release identity and stale-release isolation remain unchanged.
