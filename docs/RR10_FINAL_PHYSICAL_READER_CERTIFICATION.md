# RR10 — Final Physical Reader Certification & Release Candidate Freeze

## Purpose

RR10 is the final reader release phase. No broad reader feature work belongs here. The goal is to freeze one production-verified source SHA, certify that exact build on the required physical-device matrix, fix any real-device P0/P1/P2 findings without weakening the gates, and create `v1.0.0` only after the frozen source, physical evidence snapshot, protected `main`, and production identity all agree.

## Current baseline

- RR10 Stage A is merged on `main` as source `b4789ace73b0c3dd5cf6b435f0692f3ea9273ea2`.
- Deploy Library run `33409963085` production-certified that source through staged Browser Acceptance, RR4 performance, RR5 offline/PWA, RR6 accessibility, RR7 ergonomics, RR8 durability, RR9 security, GitHub Pages deployment, and live custom-domain/source-artifact verification.
- Physical-device evidence remains **0/12**.
- `main` remains unprotected and therefore cannot yet receive the final source-freeze merge.
- `rr10-v1-source-freeze` prepares package/changelog metadata as `1.0.0`; this is pre-tag release preparation, not a final release claim.
- Issue #36 remains the physical-device release blocker and RR10 execution checklist.
- The final release gate uses two immutable identities: the tested application source SHA and a descendant physical-evidence commit SHA containing record-only changes.

## RR10 progress

- **Stage A — complete:** release/evidence architecture merged and production-verified.
- **Stage B — blocked:** enable GitHub protection on `main`.
- **Stage C — prepared:** final `1.0.0` metadata branch exists; do not merge it until Stage B is satisfied.
- **Stages D–K — pending:** exact source freeze, evidence branch, 12-device campaign, exact evidence certification, and final tag.

## RR10 invariants

1. A responsive browser profile is not physical-device evidence.
2. A Playwright WebKit run is not an iPhone/iPad pass.
3. The source SHA must be frozen before final physical evidence is collected.
4. Physical records must name the frozen source SHA in `release.buildSha`.
5. Evidence records live only on `v1-physical-evidence` after the source is frozen.
6. The evidence branch may differ from the source only under `evidence/physical-devices/records/*.json`.
7. The evidence branch is never merged back into the frozen source candidate.
8. Any source change after the physical campaign starts invalidates final-release evidence for the old source.
9. No open P0/P1 may remain. P2 must be fixed or explicitly accepted before v1.0. P3 may be deferred.
10. No release gate may be weakened to make the campaign pass.

## Stage A — Close code/release-gate blockers

Before freezing the source:

- merge the two-SHA physical-evidence release architecture;
- require all current automated release checks to pass;
- keep the public-catalog qualification introduced after hiding unfinished books;
- do not reintroduce stale publication fixtures or hidden-book assumptions;
- confirm `pnpm release:certify` remains green.

Exit: one clean `main` commit exists with the final release-gate architecture and no known automated reader regression.

**Status: complete.** Source `b4789ace73b0c3dd5cf6b435f0692f3ea9273ea2` passed the complete production pipeline in run `33409963085`.

## Stage B — Protect main

Configure GitHub `main` protection before the final source candidate is prepared.

Minimum required policy:

- pull requests required for ordinary changes;
- Quality required;
- Browser Acceptance required;
- Security Hardening required;
- force pushes disabled;
- branch deletion disabled.

Recommended: also require stable Accessibility, Reading Ergonomics, Offline Reliability, and Data Durability checks where GitHub can require them without path-filter deadlocks.

Exit: GitHub API reports `main.protected === true`.

**Status: blocked.** The connected GitHub tooling can verify protection but cannot enable repository rulesets; the repository owner must enable this in GitHub Settings before Stage C is merged.

## Stage C — Prepare and freeze final source

On protected `main`:

1. Set `package.json` to `1.0.0`.
2. Add the dated `1.0.0` changelog section.
3. Keep documentation explicit that physical certification/tagging is still pending.
4. Run the complete automated release matrix.
5. Deploy through the ordinary production workflow.
6. Verify `/library/release-identity.json` equals the exact source SHA.
7. Freeze that SHA as `expected_source_sha`.

The metadata portion is prepared on `rr10-v1-source-freeze`. That branch may be tested before Stage B completes, but it must not be merged to `main` until branch protection is active. The exact merge commit—not the preparation branch head—becomes eligible for production verification and final source freeze.

After freeze, do not modify application source unless a physical-device defect requires a fix. If a fix is required, produce a new source SHA, redeploy/reverify it, and restart final physical certification against the new SHA.

## Stage D — Create immutable evidence branch

Create `v1-physical-evidence` directly from `expected_source_sha`.

From that point:

- only `evidence/physical-devices/records/*.json` may change;
- every record uses the same `expected_source_sha`;
- successful and failed historical test records are immutable evidence, not files to rewrite for appearances;
- fixes are performed on a normal source branch, never on the evidence branch.

## Stage E — Physical device matrix

Certify all 12 required targets from `evidence/physical-devices/matrix.json`:

- Android Chrome;
- Android Samsung Internet;
- Android Firefox;
- lower-performance Android Chrome at or below the matrix RAM limit;
- iPhone Safari;
- iPhone installed PWA;
- iPad Safari;
- Windows Edge;
- Windows Chrome;
- Windows Firefox;
- macOS Safari;
- macOS Chrome.

Use actual hardware. A single physical device may satisfy multiple browser targets where the matrix permits it, but the lower-performance Android constraint must be met by genuinely qualifying hardware.

## Stage F — Reader journeys

For every target, execute exactly the required journeys from the matrix. At minimum the campaign must physically exercise the following reader risks where applicable:

### EPUB

- open and reach ready state;
- tap/click previous and next page;
- center control toggle without accidental page turn;
- swipe/touch navigation;
- mouse page rails;
- trackpad/wheel pagination;
- paginated ↔ scroll transition;
- single/double/auto spread;
- typography changes without losing position;
- contents navigation;
- search and result navigation;
- bookmark create/open/remove;
- highlight/note creation and restoration;
- native text selection without accidental navigation;
- links and publication-owned controls;
- portrait/landscape/narrow/split-view adaptation;
- background/resume;
- browser Back/Forward and reader exit;
- software keyboard behavior.

### PDF

- ready state and text rendering;
- previous/next/direct page navigation;
- page rails;
- touch/swipe where supported;
- fit width / fit page / bounded zoom;
- selectable text;
- search and result navigation;
- page bookmark create/open/remove;
- rotation/resizing;
- background/resume;
- retry/original-file recovery path.

### Persistence/offline

- exit and reopen near the same EPUB CFI or PDF page;
- close/relaunch browser or standalone PWA;
- reopen explicitly downloaded supported content offline;
- show explicit recovery for unavailable offline content;
- reconnect without clearing reading state.

## Stage G — Sustained sessions

Every selected passing record must satisfy the matrix session minimum, currently at least 30 minutes where required.

During sustained reading, watch for:

- progressive page-turn latency;
- blank or repeated pages;
- duplicate gesture handling;
- increasing memory pressure;
- device heating or tab termination;
- controls becoming unresponsive;
- position drift;
- background/resume reload loops;
- stale or duplicated panels/toolbars.

## Stage H — Assistive-technology acceptance

Physical acceptance must include the required real assistive-technology families rather than only automated accessibility checks:

- TalkBack on Android;
- VoiceOver on iPhone/iPad/macOS where required;
- NVDA on Windows where required;
- keyboard-only operation;
- large text/browser zoom;
- reduced motion/high-contrast/forced-colors behavior where applicable.

Core journey: open/import → read → navigate → search/bookmark → resume → exit without focus loss, inaccessible controls, or hidden interactive state.

## Stage I — Defect loop

For every discovered defect:

1. Record target ID and frozen source SHA.
2. Classify P0/P1/P2/P3.
3. File it using the physical-device defect template when material.
4. P0/P1: block release immediately.
5. P2: fix or explicitly accept before final v1.
6. P3: may be deferred.
7. Fix application defects on a normal source branch.
8. Merge through protected `main` and rerun all automated gates.
9. Deploy and verify the new source SHA.
10. Restart final physical certification for the new source where required.

Never edit the old evidence record to imply that the failed build passed.

## Stage J — Exact evidence certification

When all 12 target records pass for the same frozen source:

1. Run the **Physical Device Evidence** workflow from `v1-physical-evidence`.
2. Input `tested_build_sha = expected_source_sha`.
3. Require the workflow to verify ancestry and record-only diff scope.
4. Require `pnpm certify:physical:release` to prove 12/12 with zero errors.
5. Retain the machine-readable report.
6. Record the exact passing `physical_evidence_sha`.

Exit: both immutable SHAs are known and the release report proves 12/12 current passing targets.

## Stage K — Final v1 release

Run **v1 Release** with:

- `expected_source_sha` = frozen production source SHA;
- `physical_evidence_sha` = exact passing evidence commit SHA.

The workflow must independently verify:

- both SHAs are exact and immutable;
- evidence descends from source;
- evidence contains record-only changes;
- physical report proves 12/12 for the source SHA;
- source passes RR9/security/dependency gates;
- full reader/build certification passes;
- production still serves the source SHA;
- `main` is protected;
- package/changelog are final;
- `v1.0.0` does not already exist.

Only then may the workflow create annotated tag `v1.0.0` on `expected_source_sha`.

## Completion criteria

RR10 is complete only when:

- automated reader/release matrix is green;
- `main` is protected;
- one final source SHA is frozen and production-verified;
- physical evidence is 12/12 for that exact source;
- no unresolved P0/P1 remains;
- all P2 findings are fixed or explicitly accepted;
- the exact physical evidence snapshot passes the release validator;
- final v1 workflow passes;
- tag `v1.0.0` points to the frozen production source SHA;
- issue #36 can be closed with the exact source/evidence identities and release evidence.

Until those criteria are met, the reader may be a production-verified release candidate but must not be represented as final v1.0.
