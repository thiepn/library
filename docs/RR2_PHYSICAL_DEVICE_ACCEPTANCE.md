# RR2 — Physical-Device Acceptance and Evidence

## Purpose

RR2 converts the browser-engine and simulated device-profile confidence from RR1 into named, reproducible physical-device evidence.

A Playwright WebKit run is not an iPhone test. A 390-pixel browser viewport is not a real phone with moving browser chrome, a software keyboard, native text-selection handles, safe areas, memory pressure, thermal behavior, or operating-system lifecycle events. RR2 therefore records who tested which physical device, operating system, browser, exact build, journeys, defects, and supporting evidence.

The framework is complete only when the evidence system exists. **The phase itself is release-complete only when all required physical targets pass for one exact build SHA.** No current physical pass is inferred from automated tests.

## Target matrix

The authoritative machine-readable matrix is `evidence/physical-devices/matrix.json`.

| Target ID | Required environment | Required variants and inputs |
| --- | --- | --- |
| `android-chrome` | Android phone, Chrome | portrait, landscape, touch |
| `android-samsung-internet` | Android phone, Samsung Internet | portrait, landscape, touch |
| `android-firefox` | Android phone, Firefox | portrait, landscape, touch |
| `android-low-end-chrome` | lower-performance Android phone, Chrome, at most 6 GB RAM | portrait, landscape, touch |
| `ios-safari` | iPhone, Safari browser | portrait, landscape, touch |
| `ios-pwa` | iPhone, installed standalone Library PWA | portrait, landscape, standalone, touch, offline/PWA journey |
| `ipados-safari` | iPad, Safari | portrait, landscape, split view, touch |
| `windows-edge` | Windows desktop/laptop, Edge | ordinary and narrow window, keyboard, pointer |
| `windows-chrome` | Windows desktop/laptop, Chrome | ordinary and narrow window, keyboard, pointer |
| `windows-firefox` | Windows desktop/laptop, Firefox | ordinary and narrow window, keyboard, pointer |
| `macos-safari` | macOS desktop/laptop, Safari | ordinary and narrow window, keyboard, trackpad |
| `macos-chrome` | macOS desktop/laptop, Chrome | ordinary and narrow window, keyboard, trackpad |

A single physical device may produce more than one target record when the browser environment genuinely differs. The lower-performance Android target must use hardware meeting the matrix memory constraint; relabeling a flagship device does not satisfy it.

## Prerequisites

Before beginning a run:

1. Identify the exact deployed or locally served 40-character Git SHA.
2. Record the application version and HTTPS URL.
3. Update the operating system and target browser to the version being certified, then record both exact versions.
4. Use a physical device. Emulators, simulators, remote responsive modes, and browser device profiles remain useful diagnostics but do not count here.
5. Use public hosted books or non-sensitive test fixtures for screenshots and recordings.
6. Ensure enough free storage exists to test imports and persistence. Storage-denial and quota behavior belong to a later resilience phase unless they block ordinary RR2 reading.
7. Start with no unresolved P0/P1 defect already known for the target.

## Execution protocol

For each matrix target:

1. Copy `evidence/physical-devices/records/_record-template.json` to a filename matching the final `recordId`.
2. Fill the human tester, physical hardware, OS, browser, exact release SHA, version, and URL fields.
3. Run every journey listed for the target in `matrix.json`.
4. Record a concise observation for every journey. Do not write only “works”; state what was exercised and what position or state was preserved.
5. Attach at least one evidence item. A sustained session should preferably have a short screen recording or time-stamped test log; defects should link to an issue.
6. Record every defect, including P2/P3 findings. A passing record may include closed defects or explicitly accepted P2/P3 defects, but never an open P0/P1.
7. Run `pnpm certify:physical:structure` before committing the record.
8. Repeat failed or blocked journeys after fixes in a new immutable record rather than rewriting historical evidence to look successful.
9. When one exact build has a passing record for every target, run the manual **Physical Device Evidence** workflow from the dedicated evidence branch with that build SHA.

The exact-build validator is the only machine-generated RR2 release pass.

## Evidence snapshot architecture

Physical evidence and application source use **two immutable Git SHAs**.

- The **frozen source SHA** is the exact application source already deployed and production-verified. This is the SHA every physical record names in `release.buildSha`, and it is the SHA that can eventually receive tag `v1.0.0`.
- The **physical evidence commit SHA** is the exact commit containing the 12 physical records that certify the frozen source.

These cannot be the same commit. A record must contain the source SHA; committing that record necessarily creates a different commit SHA. Requiring the evidence to live inside the same source commit would therefore make the release gate self-referential.

The release procedure is:

1. Finish all source changes, enable protected `main`, prepare final v1 metadata, deploy, and production-verify one exact source SHA.
2. Freeze that SHA. Any subsequent source change invalidates the physical campaign for final release purposes.
3. Create `v1-physical-evidence` **from the exact frozen source SHA**.
4. On that branch, change only `evidence/physical-devices/records/*.json`. Do not modify product code, workflows, schemas, matrix definitions, package metadata, or documentation there.
5. Every physical record keeps `release.buildSha` equal to the frozen source SHA.
6. When 12/12 pass, run the manual Physical Device Evidence workflow from `v1-physical-evidence`. Retain both the tested source SHA and the exact evidence commit SHA from its artifact.
7. The evidence branch **must not be merged back into the frozen source candidate**. Final v1 independently checks out both immutable commits, verifies the evidence commit descends from the source and contains record-only differences, validates the records using the source's trusted validator, and tags the source SHA only.

This separation lets evidence be collected and corrected without silently changing the application build being certified.

## Journey acceptance criteria

### `catalog-navigation`

- Catalog, book details, My Library, and return navigation load normally.
- No page-level horizontal overflow occurs.
- Search, save/import entry points, and primary reading actions remain reachable.
- Browser or operating-system back navigation does not strand the user on a dead page.

### `hosted-epub-start-resume`

- A hosted EPUB reaches the ready state.
- The tester advances to a recognizably different location, exits, and reopens it.
- Resume returns to the same exact release and a credible nearby CFI location.
- Loading, retry, and exit controls remain usable throughout.

### `epub-layout-appearance`

- Paginated and scrolling modes work.
- Spread, typography, text size, line height, paragraph spacing, width, margins, and theme controls remain reachable.
- Reflow does not throw the reader to the beginning or create an unusable blank surface.
- Browser chrome or device rotation does not cover core controls.

### `epub-tools`

- In-book search returns a result and opens it.
- A bookmark is created, listed, reopened, and removed.
- A text selection can become a highlight or note and is restored after reopening.
- Contents, search, bookmarks, annotations, and appearance panels do not overlap or trap focus.

### `hosted-pdf-start-resume`

- A hosted PDF reaches the ready state and renders selectable text when the document supports it.
- Previous, next, and direct page navigation work.
- Closing and reopening resumes the recorded page for the exact release.
- A rendering failure exposes a usable retry or original-file path rather than an endless spinner.

### `pdf-tools`

- Search opens, finds a result, navigates to it, and closes cleanly.
- Page bookmarks can be added, listed, reopened, and removed.
- Fit width, fit page, and bounded zoom preserve the current page.
- Dialogs restore focus to their owning control.

### `personal-import-reopen`

- A valid EPUB and PDF can be selected from the real system file picker.
- Each imported book appears once in My Library; duplicate import is handled accurately.
- Both canonical personal-reader routes open and reopen after leaving the page.
- No personal file is uploaded or exposed in evidence.

### `viewport-adaptation`

- Every target-required variant in the matrix is exercised.
- Portrait, landscape, split view, narrow window, and ordinary window states preserve readable content and reachable controls as applicable.
- Notches, home indicators, browser bars, and low-height landscape windows do not cover the active control or reading surface.

### `software-keyboard`

- Search, note, page, or other reader inputs remain visible when focused.
- The keyboard does not permanently reduce the reader after dismissal.
- Orientation or browser-chrome changes are not misclassified as a stuck keyboard.

### `keyboard-dialogs`

- Core actions can be reached with Tab/Shift+Tab and activated with the keyboard.
- Escape dismisses the topmost overlay.
- Focus returns to the control that opened the dialog.
- No hidden or inert control receives focus.

### `native-selection`

- Native text handles can select publication content.
- Selection does not trigger an accidental page turn.
- Selection actions remain reachable and can be dismissed.
- Pinch zoom and vertical pan remain available where the platform supports them.

### `browser-history`

- Back, Forward, reader exit, and route re-entry preserve a coherent history stack.
- A page turn does not create browser-history entries.
- Re-entering the reader does not create duplicate controllers or dead controls.

### `background-resume`

- Background the browser or standalone PWA; lock the mobile device where applicable.
- Resume after at least one minute.
- The current book remains readable or performs one bounded reload with position recovery.
- No reload loop, blank canvas, stale modal, or duplicated toolbar appears.

### `offline-pwa`

- Install and launch the PWA in standalone mode.
- Cache a format that the product explicitly supports offline.
- Disable connectivity, close, and reopen the PWA.
- Downloaded content opens; unavailable content receives explicit recovery copy.
- Returning online repairs ordinary operation without clearing reading state.

### `sustained-session`

- Use the reader continuously for at least 30 minutes.
- Exercise ordinary navigation and at least two reader panels during the session.
- No increasing lag, repeated blank rendering, runaway device heating, memory-related tab termination, or progressive control failure is observed.
- Record the actual duration in `sessionMinutes`.

## Evidence rules

A passing record must contain:

- a unique record ID and matching filename;
- the exact 40-character build SHA;
- a named human tester;
- manufacturer and model of physical hardware;
- exact OS and browser versions;
- every required input and viewport variant;
- every required journey with `status: "pass"`;
- at least the matrix minimum sustained-session duration;
- at least one screenshot, recording, log, issue, or other evidence reference;
- no open P0/P1 defect.

Evidence is current for the maximum age configured in the matrix, presently 90 days. A new release SHA requires new exact-build evidence even when the same device was recently tested. The validator may select the newest passing record when multiple records exist for a target and SHA.

Do not attach private EPUB/PDF pages, personal notifications, account details, credentials, tokens, or unrelated personal information. Evidence links must use HTTPS or a safe repository-relative path.

## Defect policy

| Severity | Physical-device meaning | RR2 rule |
| --- | --- | --- |
| P0 | data loss, security boundary failure, widespread crash, or reader cannot open | immediate blocker |
| P1 | core read, navigate, resume, import, accessibility, or exit path is broken on a required target | release blocker |
| P2 | important degradation with a usable workaround | fix or explicitly accept before v1.0 |
| P3 | cosmetic or optional polish | may be scheduled after v1.0 |

Create physical findings through `.github/ISSUE_TEMPLATE/physical-device-defect.yml`. Include the target ID and exact build SHA so a later passing record can show the defect was actually retested.

## Validation commands

Structural validation permits zero records while the test campaign is incomplete, but rejects malformed or dishonest records:

```bash
pnpm certify:physical:structure
```

Exact-release validation is deliberately fail-closed. For local diagnosis against the current record directory:

```bash
pnpm certify:physical:release -- --expected-sha <40-character-build-sha>
```

For final certification, run the `Physical Device Evidence` GitHub Actions workflow from `v1-physical-evidence` with the tested source SHA. It validates evidence structure, checks evidence-branch ancestry and the record-only diff boundary, runs the exact-build gate, and retains a machine-readable artifact containing both immutable SHAs.

## Exit criteria

RR2 is complete for a release candidate only when:

- all 12 required target IDs have a current passing physical record for the same exact build SHA;
- every required journey, input, and viewport variant passes;
- the low-end Android constraint is satisfied by real lower-performance hardware;
- at least one iPhone installed-PWA run passes offline recovery;
- iPad portrait, landscape, and split view pass;
- every record includes evidence and a sustained session of at least 30 minutes;
- no open P0/P1 defect remains;
- the manual exact-build workflow exits successfully for the frozen source SHA;
- the generated release report records the exact physical evidence commit SHA and is retained with the release candidate evidence.

## Current evidence status

**0/12 required physical targets are certified.**

Implemented in RR2:

- authoritative matrix;
- evidence schema and non-counting template;
- structural and exact-SHA validators;
- immutable source/evidence snapshot architecture;
- CI and manual release workflow;
- defect intake form;
- documentation and permanent source certification.

Still required outside automation:

- protect `main`;
- freeze one exact production-verified final source SHA;
- create `v1-physical-evidence` from that SHA;
- operate the application on the named physical devices;
- capture evidence;
- fix or disposition discovered defects;
- add passing exact-build records and retain the final evidence commit SHA.
