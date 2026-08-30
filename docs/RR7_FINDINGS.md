# RR7 — Findings Register

This register distinguishes deterministic/code findings from physical-device findings. A finding is not closed by emulation when its acceptance criterion requires physical hardware.

| ID | Area | Severity | Evidence class | Status | Finding / disposition |
| --- | --- | --- | --- | --- | --- |
| RR7-001 | EPUB desktop navigation | P1 | browser-engine | fixed before RR7 branch | Paginated Firefox double-page mouse geometry could misclassify center/edge clicks. Fixed in `38c50ed1d559ae731211d72e4e4b327ac09e006e` with visible-slice normalization and regression coverage. |
| RR7-002 | EPUB scroll mode | P2 | browser-engine | fixed before RR7 branch | Page-turn rails/footer arrows were misleading in native scroll mode. They now disappear while scrolled and return in paginated mode. |
| RR7-003 | Physical device operation | P1 release blocker | physical hardware | open — tracked in #36 | Automated device profiles exist, but current physical evidence is incomplete. Do not claim real-device certification until exact-SHA evidence is recorded. |
| RR7-004 | EPUB settings panels | P2 | browser-engine | fixed on RR7 branch | Appearance/reading-mode panels did not own clicks on exposed publication content, so an outside tap could navigate the book behind a still-open panel. RR7 adds a reading-surface interaction backdrop, preserves top/bottom shell commands, and certifies that outside dismissal does not change the authoritative CFI. |
| RR7-005 | EPUB settings dismissal | P2 | browser-engine | fixed on RR7 branch | Appearance and reading-mode sheets had no explicit close action, making dismissal undiscoverable on touch devices. RR7 adds named close controls that call the existing shell panel API, with 44px phone targets, trigger-focus recovery, and CFI-stability coverage. |
| RR7-006 | My Library storage recovery | P2 | browser-engine | fixed on RR7 branch | A blocked local database collapsed into a generic empty-looking state with no recovery action, while personal-book subscription refreshes could bypass the guarded renderer. RR7 adds an explicit storage error state, classified recovery guidance, a real retry path, and routes refreshes through the same guarded render flow. |
| RR7-007 | EPUB settings accessibility identity | P1 | browser-engine | fixed on RR7 branch | The first close-control implementation reused `data-reader-command="appearance|more"`, duplicating canonical toolbar command markers and breaking RR6 focus, reflow, forced-colors, and phone-target acceptance. Close controls now use independent `data-reader-panel-close` identity and restore focus to the unique toolbar trigger. |

Add each confirmed RR7 P0/P1/P2 defect here with its reproducer, fix/acceptance decision, and evidence reference.
