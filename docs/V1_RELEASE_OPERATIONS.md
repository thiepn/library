# v1 release operations

## Purpose

This runbook defines the final v1.0 release, verification, incident, and rollback process for Thiepn Library. It is intentionally fail-closed: automated readiness is necessary but cannot replace physical-device evidence or repository protection.

## Current blockers

At RR9 implementation start:

- physical-device evidence is **0/12**;
- `main` is not protected;
- package version remains `1.0.0-rc.1`;
- no `v1.0.0` tag should exist from this campaign.

These are expected blockers, not reasons to weaken the gate.

## Release candidate sequence

1. Merge RR9 only after Quality, Browser Acceptance, Publication Compatibility, Performance, Offline Reliability, Accessibility, Reading Ergonomics, Data Durability, and Security Hardening are green.
2. Allow the normal production workflow to build the exact merge source.
3. Require RR3–RR9 gates before Pages artifact upload.
4. Verify the live site, immutable publication media, offline/PWA assets, CSP evidence, public privacy/security/support pages, and `/release-identity.json`.
5. Keep issue #36 open until the required physical devices have actually been operated and their evidence records bind to the intended final source SHA.

## Final v1.0 cut

When the physical campaign and protected-main configuration are complete:

1. Prepare a final source commit that changes `package.json` from the release-candidate version to `1.0.0`, updates `CHANGELOG.md` with a `1.0.0` section/date, and updates release-readiness documentation with the completed physical evidence state.
2. Merge through protected `main`; do not bypass required checks.
3. Let the ordinary production deployment publish that exact source SHA.
4. Confirm `/library/release-identity.json` reports the exact final source SHA.
5. Run the `v1 release` workflow with that exact SHA.
6. The workflow re-runs the physical exact-SHA gate, RR9 source/dependency/security gates, complete release certification, and live production verification.
7. Only if every step passes may it create annotated tag `v1.0.0`.

A tag is not evidence that a release passed. The gates are evidence; the tag is the final immutable label applied after them.

## Protected-main policy

Before v1.0 tagging, `main` must report `protected: true`. Recommended required checks are the stable release signals that guard the product rather than every optional or path-filtered workflow. At minimum require:

- Quality;
- Browser Acceptance;
- Security Hardening.

Also require pull requests for ordinary human changes and prevent force pushes/deletion. The production deployment no longer needs to commit status files back to `main`, so branch protection does not require a deployment-bot bypass.

The connected automation available to ChatGPT may be able to read but not mutate repository protection. If protection cannot be changed through the available GitHub action surface, enable it in repository Settings before running the final v1 workflow. The v1 gate independently verifies the resulting GitHub API state and refuses to tag an unprotected branch.

## Security/dependency release evidence

For each release candidate retain:

- high/critical production dependency audit result;
- production license inventory;
- CycloneDX SBOM;
- cross-engine security acceptance result;
- ordinary phase-gate test evidence on failure;
- exact source SHA and GitHub Actions run identity.

These artifacts must never include personal EPUB/PDF files, browser databases, publication-ingress packages, Cloudflare credentials, or other secrets.

## Rollback

If a production release candidate is defective:

1. identify the last known-good source SHA whose production verification passed;
2. create a normal revert/rollback commit through protected main or use an approved release branch/PR that restores that source state—do not rewrite history;
3. run the same production deployment and all current gates;
4. verify the new live `/release-identity.json` and immutable publication hashes;
5. record the incident and affected release range in the changelog/security notes when material.

Publication media is immutable and versioned, so rollback must point source/registry state to an already verified release rather than overwriting an existing publication object. Browser-local reading-state schemas must remain forward-compatible; rollback must not reset IndexedDB or translate EPUB CFIs into PDF pages.

## Security incident response

For a suspected publication-processing, dependency, credential, or privacy incident:

- stop the final v1 tag or subsequent release promotion;
- revoke/rotate affected external credentials outside the repository if exposure is suspected;
- remove or disable the affected privileged workflow rather than adding bypasses;
- reproduce with non-sensitive deterministic fixtures;
- patch and add regression coverage;
- rerun the complete current production gate before redeployment.

## Completion record

Phase 9 is fully closed only when the final exact source satisfies RR9, protected-main verification, complete physical evidence, production verification, and the annotated `v1.0.0` tag. Until then, the deployed application may be a production-verified release candidate without being called final v1.0.
