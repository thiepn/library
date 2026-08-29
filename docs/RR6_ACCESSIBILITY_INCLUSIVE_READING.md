# RR6 — Accessibility and Inclusive Reading

RR6 promotes the staged-reader accessibility work from source-level P23 hardening to release-level executable acceptance across EPUB, PDF, desktop, and phone browser profiles.

## Scope

RR6 owns reader-level accessibility for:

- native EPUB reading;
- integrated PDF reading;
- keyboard navigation and focus recovery;
- touch navigation and minimum target sizing;
- 320 CSS px reflow as the WCAG 400% reference width;
- reduced-motion, forced-colors, and higher-contrast behavior;
- reader status/live-region semantics;
- iframe title/language boundaries;
- dialog naming, focus entry, Escape close, and focus return;
- browser-engine regression coverage in Chromium, Firefox, and WebKit.

Publication-authored semantics such as missing alt text, malformed heading structure, or incorrect publisher language metadata remain publication-content responsibilities. RR3/P24 owns hostile and compatibility classes; RR6 ensures the reader does not erase or obstruct valid publication accessibility.

## Mobile tap-zone contract

The fullscreen paginated EPUB reader uses three horizontal tap zones:

- left third: previous page/location;
- center third: toggle reader chrome;
- right third: next page/location.

Pointer coordinates are normalized against the visible EPUB iframe viewport. They must never be divided by a paginated document/root width that may span multiple columns.

Tap navigation is suppressed for interactive publication content and active text selection. Horizontal swipe navigation remains separate from taps.

This defect is release-blocking because the previous behavior could make every visible mobile tap resolve to the previous-page action.

## Automated acceptance

`pnpm test:accessibility` runs the RR6 browser acceptance corpus through the existing Chromium, Firefox, WebKit, Chromium-phone, and WebKit-phone profiles.

The automated corpus proves:

- EPUB reader regions, accessible control names, keyboard shortcuts, iframe title/language, live status, keyboard page turns, panel focus entry, Escape close, and focus return;
- PDF control naming, canvas/text-layer semantics, search dialog focus entry, Escape close, and focus return;
- 320 CSS px reflow without horizontal page overflow;
- >=44 CSS px primary phone reader targets;
- reduced-motion and forced-colors runtime states plus visible focus;
- left/center/right mobile EPUB tap-zone behavior.

Browser automation is an executable accessibility regression gate, but it is not a physical assistive-technology certification.

## Assistive-technology evidence boundary

RR6 does **not** claim that Playwright is VoiceOver, TalkBack, or NVDA. Final release evidence still requires operation with the named assistive-technology families on their supported physical/desktop targets. That evidence remains separate from source checks and browser-engine automation, consistent with the release-readiness roadmap and RR2 evidence policy.

Until current exact-SHA VoiceOver, TalkBack, and NVDA evidence exists, the repository may state that RR6 automated implementation is complete, but it must not claim final physical assistive-technology certification.

## Release gates

The RR6 automated implementation is eligible to merge only when:

- `pnpm certify:accessibility` passes;
- Quality passes;
- Browser Acceptance passes, including the mobile tap-zone regression;
- Accessibility Acceptance passes its cross-engine corpus;
- RR3 Publication Compatibility remains green;
- RR4 Performance Budget remains green;
- RR5 Offline Reliability remains green;
- production deployment runs Accessibility Acceptance after Browser/RR4/RR5 and before Pages artifact upload;
- live production verification passes.

No P0/P1 accessibility defect may be knowingly accepted for release.
