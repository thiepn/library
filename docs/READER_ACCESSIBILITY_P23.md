# P23 — Native EPUB reader accessibility audit

P23 audits and remediates the staged EPUB reader shell against WCAG 2.2 AA reader-level requirements. It does not certify arbitrary publisher EPUB markup; publication-content compatibility and accessibility remain part of the EPUB contract and P24.

## Audited reader surfaces

- fullscreen reader shell and skip navigation
- EPUB iframe boundary
- paginated and scrolled navigation
- native EPUB table of contents
- appearance and reading-mode controls
- search inside book
- bookmarks
- highlights and notes
- mobile, tablet, split-window, desktop, and ultrawide layouts
- all six reader themes
- reduced-motion, forced-colors, and increased-contrast preferences
- browser zoom/reflow down to the 320 CSS px WCAG reflow reference width

## WCAG 2.2 AA remediation map

| Area | Reader behavior |
| --- | --- |
| 1.3.1 / 4.1.2 semantics | Reader regions, dialogs, status channels, controls, iframe title, EPUB language preservation |
| 1.4.3 contrast | Six shell themes are source-certified at >=4.5:1 for normal text/accent colors; muted text is promoted to the AA secondary color |
| 1.4.10 reflow | Dedicated 320 CSS px reader-chrome path; no fixed-width reader shell; pinch zoom remains enabled |
| 1.4.11 non-text contrast | Focus and control boundaries are strengthened with secondary/system colors |
| 2.1.1 keyboard | Page turn shortcuts, native control tab order, Escape close behavior, and dialog keyboard containment |
| 2.4.3 focus order | Opening settings moves focus into the opened panel; closing or hidden chrome recovers focus deterministically |
| 2.4.7 focus visible | 3px theme-aware focus indication in the shell and strengthened focus inside EPUB iframes |
| 2.4.11 focus not obscured | Focus targets receive scroll margin and overlay dialogs keep focus within the visible panel |
| 2.5.8 target size | Staged reader UI enforces at least 24 CSS px targets; mobile primary controls retain 44–48 CSS px targets |
| 3.2.x predictable UI | Docked P22 sidebars remain non-modal; overlay versions become modal without changing their command meaning |

## Modal versus docked panels

P22 can turn Contents, Search, Bookmarks, or Highlights & Notes into persistent desktop sidebars. P23 therefore does not globally label every panel as modal.

- overlay panel: `aria-modal="true"` and Tab focus containment
- P22 docked panel: non-modal dialog/sidebar behavior and normal document Tab order
- Appearance / Reading Mode: non-modal dialogs with explicit focus entry and Escape restoration

This prevents the common accessibility failure where a visually persistent desktop sidebar is announced as a modal dialog and traps keyboard users inside it.

## EPUB iframe boundary

Each EPUB.js iframe receives:

- a deterministic accessible title based on the current book title
- `xml:lang` to HTML `lang` preservation when needed
- a reader-owned focus rule so publisher CSS cannot make keyboard focus invisible
- reduced-motion and forced-colors hardening inside the iframe

The reader does not invent alternative text, headings, landmarks, or language metadata that the EPUB itself did not provide. Those are publication responsibilities checked by the EPUB publication profile and P24.

## Live announcements

The existing atomic polite reader announcer remains the single deliberate status channel. P23 uses it for reading-location context while keyboard focus is in the reading workflow and when a text selection exposes highlight/note actions. Loading, search, bookmark, annotation, and error surfaces retain their dedicated status/alert semantics.

## Reflow and zoom

At the WCAG reflow reference width of 320 CSS px, reader identity chrome collapses, controls remain one-dimensional, panels become viewport bounded, and inputs/actions can wrap instead of forcing horizontal page scrolling. Mobile code continues to allow `pinch-zoom`.

## Contrast certification

The permanent P23 source certification parses all six shell theme palettes and calculates WCAG relative-luminance contrast for normal text, secondary text, accent, and danger colors against each theme background. Any audited color below 4.5:1 blocks the source gate. The final P23 CSS maps muted UI text to the already-certified secondary text color.

## Boundaries of this phase

P23 is a reader-level accessibility gate, not a claim that every future EPUB is automatically WCAG-conformant. The following remain separate gates:

- P24: publisher EPUB styling/content compatibility and publication accessibility
- P30: reader regression suite
- P31: browser and assistive-technology certification
- P36: final release certification

No P23 code is added to the legacy Markdown reader.
