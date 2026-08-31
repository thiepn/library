# v1 release operations

## Purpose

This runbook defines the final v1.0 release, verification, incident, and rollback process for Thiepn Library. It is intentionally fail-closed: automated readiness is necessary but cannot replace physical-device evidence or repository protection.

## Current blockers

At the current release-candidate stage:

- physical-device evidence is **0/12**;
- `main` is not protected;
- package version remains `1.0.0-rc.1`;
- no `v1.0.0` tag should exist from this campaign.

These are expected blockers, not reasons to weaken the gate.

## Two immutable release inputs

Final v1 certification uses two distinct immutable Git identities:

1. **Source SHA (`expected_source_sha`)** — the exact application source that is built, deployed, verified in production, and ultimately tagged `v1.0.0`.
2. **Physical evidence commit SHA (`physical_evidence_sha`)** — the exact commit on the dedicated `v1-physical-evidence` branch containing the physical-device records that certify the source SHA.

These identities must not be collapsed into one commit. Requiring the records to exist inside the source commit would be self-referential: committing records that contain the source SHA necessarily creates a different SHA.

The frozen source candidate may carry package version `1.0.0` before physical evidence is complete. That version metadata is release preparation, not a certification claim. The application is final v1 only after the separate physical evidence snapshot passes, protected `main` is verified, production still serves the exact source SHA, and the immutable `v1.0.0` tag is created.

The `v1-physical-evidence` branch must be created from the exact frozen source SHA. After that point, only `evidence/physical-devices/records/*.json` may differ from the source candidate. Evidence commits must not be merged back into the frozen source candidate. Both the manual physical-device workflow and the final v1 workflow enforce this ancestry and record-only diff boundary.

## Release candidate sequence

1. Keep ordinary release-candidate changes on normal PR branches and require the complete automated release matrix.
2. Enable protected `main` before the final v1 source is frozen. At minimum, require Quality, Browser Acceptance, and Security Hardening, require pull requests, and disallow force pushes/deletion.
3. Prepare the **final source candidate** on protected `main`:
   - set `package.json` to `1.0.0`;
   - add the dated `1.0.0` section to `CHANGELOG.md`;
   - keep release documentation honest that physical certification and the tag are still pending;
   - make no claim that package version metadata alone is a release.
4. Let the normal production workflow build and deploy that exact source SHA. Do not begin the physical campaign until the complete production pipeline and live `/library/release-identity.json` verification are green for that SHA.
5. Freeze that exact production SHA as `expected_source_sha`. Do not amend, rebase, merge evidence into, or otherwise change it during the device campaign.

## Physical evidence campaign

After the source SHA is frozen:

1. Create or reset the dedicated `v1-physical-evidence` branch **from the exact frozen source SHA**.
2. Copy `evidence/physical-devices/records/_record-template.json` for each real device target and set every record's `release.buildSha` to the frozen source SHA.
3. Operate all 12 required physical targets and required assistive-technology/device journeys. Commit only record JSON files to `v1-physical-evidence`; do not change product code, workflows, documentation, matrix/schema files, or package metadata on this branch.
4. After every record change, let the structural Physical Device Evidence workflow validate the evidence branch.
5. When 12/12 records are current and passing, manually run **Physical Device Evidence** from the `v1-physical-evidence` branch with `tested_build_sha` equal to the frozen source SHA.
6. Retain both immutable identities from that passing run:
   - the frozen source SHA;
   - the exact physical evidence commit SHA (`github.sha`) recorded in the workflow artifact.
7. Never rewrite successful historical records to make an older run look better. A retest after a defect produces a new immutable record/evidence commit.

## Final v1.0 cut

After the physical campaign passes and `main` is protected:

1. Confirm production still serves the frozen source SHA through `/library/release-identity.json`.
2. Run the **v1 Release** workflow with both exact inputs:
   - `expected_source_sha` = frozen production source SHA;
   - `physical_evidence_sha` = exact passing evidence commit SHA.
3. The workflow independently checks out both immutable inputs. It requires the evidence SHA to descend from the source SHA and permits only `evidence/physical-devices/records/*.json` changes between them.
4. The source's trusted validator re-validates the external record snapshot with `--records` and requires 12/12 current passing records whose `release.buildSha` equals `expected_source_sha`.
5. The workflow re-runs RR9 source/dependency/security gates, complete release certification, live production verification, protected-main verification, package/changelog checks, and the physical evidence report check.
6. Only if every step passes may it create annotated tag `v1.0.0` **on `expected_source_sha`**. The evidence commit is never tagged as application source.

A tag is not evidence that a release passed. The gates are evidence; the tag is the final immutable label applied after them.

## Protected-main policy

Before v1.0 tagging, `main` must report `protected: true`. Recommended required checks are the stable release signals that guard the product rather than every optional or path-filtered workflow. At minimum require:

- Quality;
- Browser Acceptance;
- Security Hardening.

Also require pull requests for ordinary human changes and prevent force pushes/deletion. The production deployment no longer needs to commit status files back to `main`, so branch protection does not require a deployment-bot bypass.

The connected automation available to ChatGPT may be able to read but not mutate repository protection. If protection cannot be changed through the available GitHub action surface, enable it in repository Settings before freezing the final v1 source. The v1 gate independently verifies the resulting GitHub API state and refuses to tag an unprotected branch.

## Security/dependency release evidence

For each release candidate retain:

- high/critical production dependency audit result;
- production license inventory;
- CycloneDX SBOM;
- cross-engine security acceptance result;
- ordinary phase-gate test evidence on failure;
- exact source SHA and GitHub Actions run identity;
- exact physical evidence commit SHA and its machine-readable 12/12 release report.

These artifacts must never include personal EPUB/PDF files, browser databases, publication-ingress packages, Cloudflare credentials, or other secrets.

## Rollback

If a production release candidate is defective:

1. identify the last known-good source SHA whose production verification passed;
2. create a normal revert/rollback commit through protected main or use an approved release branch/PR that restores that source state—do not rewrite history;
3. run the same production deployment and all current gates;
4. verify the new live `/release-identity.json` and immutable publication hashes;
5. record the incident and affected release range in the changelog/security notes when material.

Publication media is immutable and versioned, so rollback must point source/registry state to an already verified release rather than overwriting an existing publication object. Browser-local reading-state schemas must remain forward-compatible; rollback must not reset IndexedDB or translate EPUB CFIs into PDF pages.

If rollback changes the source SHA before final v1 tagging, prior physical evidence no longer certifies the new source. A new exact-SHA physical campaign is required.

## Security incident response

For a suspected publication-processing, dependency, credential, or privacy incident:

- stop the final v1 tag or subsequent release promotion;
- revoke/rotate affected external credentials outside the repository if exposure is suspected;
- remove or disable the affected privileged workflow rather than adding bypasses;
- reproduce with non-sensitive deterministic fixtures;
- patch and add regression coverage;
- rerun the complete current production gate before redeployment;
- if the source SHA changes, invalidate the prior physical campaign for release purposes and retest the new source.

## Completion record

Phase 9 is fully closed only when one frozen production source SHA satisfies RR9, protected-main verification, a separately pinned 12/12 physical evidence snapshot, production verification, and the annotated `v1.0.0` tag. Until then, the deployed application may be a production-verified release candidate without being called final v1.0.
