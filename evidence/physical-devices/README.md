# RR2 physical-device evidence

This directory is the auditable evidence store for **RR2 — Physical-Device Acceptance and Evidence**.

Automated browser projects and responsive viewport simulations do not belong here. A record counts only when a named person operated a real device against an exact Library build and recorded the result.

## Layout

```text
evidence/physical-devices/
├── matrix.json                 # required targets, variants, inputs, and journeys
├── record.schema.json          # machine-readable record contract
└── records/
    ├── _record-template.json   # copy-only template
    └── <record-id>.json        # real evidence records
```

Files beginning with `_` are templates. They are ignored by the validator and **never count as evidence**.

## Immutable evidence branch

Final v1 uses a dedicated `v1-physical-evidence` branch so physical records do not change the application source SHA they certify.

1. Finish and production-verify the exact source candidate first.
2. Create `v1-physical-evidence` directly from that frozen source SHA.
3. Add or update only `evidence/physical-devices/records/*.json` on the evidence branch.
4. Every record's `release.buildSha` must remain the frozen source SHA.
5. When 12/12 pass, retain the exact **physical evidence commit SHA** from the successful evidence workflow.
6. The evidence branch **must not be merged back into the frozen source candidate**. The final v1 gate reads the record snapshot from its own immutable commit and tags the original source SHA only.

Both the manual evidence workflow and final v1 workflow enforce that the evidence commit descends from the tested source and contains no changes outside the record JSON directory.

## Record workflow

1. Copy `records/_record-template.json` to `records/<record-id>.json` on `v1-physical-evidence`.
2. Choose one target from `matrix.json` and replace every placeholder.
3. Test the exact frozen source SHA recorded in `release.buildSha` on physical hardware.
4. Complete every journey required by the selected target.
5. Add at least one screenshot, screen recording, test log, or issue reference. Use public fixture or hosted book content; do not expose private personal-book pages.
6. Name the file exactly `<recordId>.json`.
7. Run structural validation:

```bash
pnpm certify:physical:structure
```

8. When all targets have current passing records for one release candidate, dispatch **Physical Device Evidence** from `v1-physical-evidence` with `tested_build_sha` equal to the frozen source SHA. The workflow runs the equivalent exact-build gate and records both immutable SHAs.

For local diagnosis, the same release validator is available as:

```bash
pnpm certify:physical:release -- --expected-sha <40-character-build-sha>
```

The release gate selects the newest valid passing record for every required target. Records for another build, stale records, emulators, incomplete journeys, open P0/P1 defects, and placeholder values do not count.

## Evidence references

An evidence reference may be:

- an HTTPS URL, such as a GitHub issue attachment, screen recording, or CI test log;
- a safe repository-relative path containing non-sensitive textual evidence.

Do not commit credentials, private imported-book content, personal notifications, unredacted personal information, or secrets. Crop or redact device recordings before attaching them.

## Current status

**0/12 physical targets are certified.** The RR2 framework is implemented, but no physical-device pass is claimed until real records are added to the dedicated evidence branch and the exact-build release gate succeeds.
