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

## Record workflow

1. Copy `records/_record-template.json` to `records/<record-id>.json`.
2. Choose one target from `matrix.json` and replace every placeholder.
3. Test the exact build recorded in `release.buildSha` on physical hardware.
4. Complete every journey required by the selected target.
5. Add at least one screenshot, screen recording, test log, or issue reference. Use public fixture or hosted book content; do not expose private personal-book pages.
6. Name the file exactly `<recordId>.json`.
7. Run structural validation:

```bash
pnpm certify:physical:structure
```

8. When all targets have current passing records for one release candidate, run the exact-build gate:

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

**0/12 physical targets are certified.** The RR2 framework is implemented, but no physical-device pass is claimed until real records are added and the exact-build release command succeeds.
