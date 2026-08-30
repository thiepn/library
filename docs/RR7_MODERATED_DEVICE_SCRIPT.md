# RR7 — Moderated Phone, Tablet & Desktop Task Script

Use this script on the exact release candidate SHA. Automated device profiles can rehearse the geometry, but the moderated result must be recorded from the actual target device/browser.

## Common preparation

- Start with a clean browser profile where practical.
- Record device model, OS version, browser/version, installed-PWA state, orientation, input method, and exact source SHA.
- Have one representative EPUB and one representative PDF available.
- Do not compensate for defects with undocumented workarounds.

## Phone journey

1. Open the catalog and enter My Library.
2. Import/open an EPUB; confirm the first readable page appears without clipped chrome or layout jump.
3. Turn pages by the normal touch gesture and by visible controls where present.
4. Tap the center reading area to hide/reveal chrome; verify reading position does not move.
5. Select text; verify selection handles do not turn the page.
6. Open Contents, appearance, Search/Saved where supported; open and close the software keyboard.
7. Switch paginated/scrolled mode and confirm page-turn affordances disappear in scroll mode.
8. Rotate portrait → landscape → portrait; confirm position and controls recover.
9. Leave the reader, reopen the same book, and verify resume.
10. Repeat the essential path with a PDF, including Search and Saved/bookmark panels.
11. Background the browser/app and resume.
12. Run the relevant offline/downloaded-book path.

## Tablet journey

1. Open EPUB in portrait; navigate, select text, open Contents and appearance.
2. Rotate to landscape and confirm pagination/spread changes do not lose position.
3. Exercise split view or a narrow application window where the platform supports it.
4. Verify dialogs/panels remain reachable and dismissible without covering required controls.
5. Open PDF; test fit width/page, Search, Saved/bookmarks, rotation, and resume.
6. Use touch plus hardware keyboard/trackpad where available.

## Desktop journey

1. Open EPUB at a wide viewport.
2. Navigate with left/right content clicks, explicit page rails, footer controls, and keyboard arrows/page keys.
3. Verify each gesture causes exactly one page movement.
4. Verify center click toggles chrome without changing reading position.
5. Drag-select text across several words/lines; verify no accidental page turn occurs.
6. Activate an internal/external link and confirm it is not intercepted as navigation.
7. Resize from wide to narrow and back; verify position continuity and no trapped panels.
8. Switch to scroll mode; verify page rails/footer page arrows disappear and native scrolling works.
9. Exit and reopen; verify resume.
10. Repeat core navigation/search/bookmark/exit/resume with PDF.

## Sustained-session addendum

On the lower-performance Android target, keep an EPUB/PDF reading session active for at least 30 minutes, including repeated chapter/page movement, panel opens, orientation changes, background/resume, and at least one reader exit/re-entry. Record visible lag, dropped input, stale controls, crashes, reloads, memory-pressure symptoms, or position loss.

## Pass rule

A target passes only when all required tasks complete without workaround and no unresolved P0/P1 remains. P2 findings must be fixed or explicitly accepted before v1.0. Evidence must be bound to the exact release SHA.
