# RR8 — Data Durability, Migration, Backup & Portability

Status: implementation and automated acceptance phase.

## Purpose

RR8 makes browser-local reading state durable enough to survive application schema upgrades and portable enough to move between browsers without developer tools. It does not introduce accounts, telemetry, or automatic cloud synchronization.

The governing rule is simple: **a migration or restore must never silently destroy the user’s current authoritative reading position.**

## Persisted state contract

### Main Library IndexedDB

Database: `thiepn-library`

RR8 advances the schema from v8 to v9. The upgrade is additive:

- all existing stores remain;
- `pdfProgress` is added for portable PDF positions;
- `pdfBookmarks` is added with a `publicationKey` index;
- `portablePersonalMetadata` is added for metadata-only personal-book restore;
- old unversioned favorites become schema v1 records;
- old legacy Markdown progress becomes schema v1 records;
- old legacy annotations become schema v1 records;
- native EPUB progress remains schema v2 and keeps exact CFI identity;
- reading activity remains schema v1;
- native EPUB bookmarks and annotations remain schema v2.

The v7 P29 legacy-progress sidecar migration remains intact. RR8 does not merge legacy chapter positions into native EPUB CFIs.

### PDF compatibility database

Historical PDF state may still exist in `thiepn-library-pdf-reader` v1. RR8 does not delete this database.

New PDF writes use the main Library database. Reads fall back to the historical PDF database and can migrate matching records forward best-effort. Backup export reads both locations so old state remains portable even before a PDF is reopened.

### Personal publication database

Database: `thiepn-library-personal-books`

RR8 advances v2 to v3 and adds `schemaVersion: 1` to historical book records in place. The file `ArrayBuffer`/`Blob` is not transformed by that migration.

Personal publication bytes remain in the dedicated personal-book database and never move into the main portable state database.

### LocalStorage settings

RR8 gives the site appearance record an explicit schema v1 while accepting and upgrading the historical unversioned `{ appearance }` shape.

Existing EPUB and PDF reader settings retain their current schema-v1 records.

## Backup format

Manual backups are JSON files with:

- `kind: "thiepn-library-backup"`;
- archive `schemaVersion: 1`;
- creation time and source Library DB version;
- optional sections, allowing partial backups/restores;
- explicit integrity metadata and export warnings.

The metadata archive is bounded to 8 MiB. Restore rejects malformed JSON, unknown archive versions, invalid records, and duplicate identities before any mutation begins.

### Included

Ordinary backups include:

- My Library favorites;
- reading activity;
- native EPUB progress with exact CFI/release identity;
- legacy web-reader progress;
- EPUB bookmarks;
- EPUB highlights and notes;
- legacy notes retained by the old reader;
- PDF page progress;
- PDF bookmarks;
- application, EPUB-reader, and PDF-reader settings;
- personal-book metadata and content hashes.

### Deliberately excluded

Ordinary backups **do not contain personal EPUB/PDF file bytes or cover blobs**.

This is intentional. A JSON metadata backup should not unexpectedly duplicate private books into a portable archive. After restore, a matching personal file can be re-imported locally; its content hash reconnects the restored metadata. RR8 does not implement the roadmap’s optional encrypted file archive.

## Restore semantics

Restore is merge-only. It never clears a store before writing.

Rules:

- favorites are unioned;
- newer current records win over older backup records;
- native EPUB progress is only replaced when the work, edition, and release identity match and the backup record is newer;
- a different EPUB edition/release is treated as stale and cannot overwrite the current position;
- legacy progress uses newest `updatedAt`;
- bookmarks/highlights/notes are idempotent by record identity, with newer editable records winning;
- reading activity uses newest `openedAt`;
- PDF progress uses newest `updatedAt`;
- PDF bookmarks are idempotent by exact publication/page identity;
- personal metadata uses newest `updatedAt` and does not fabricate a book file.

A partial archive only touches sections it actually contains.

## Atomicity and interruption safety

All main-database restore writes for one archive execute inside one IndexedDB `readwrite` transaction spanning the relevant stores.

Before that transaction begins, settings values are snapshotted. If the database transaction aborts because of quota, interruption, denial, or another write failure, settings are restored to their pre-restore values.

Executable browser acceptance injects a quota failure after an earlier store has already received a pending write and proves the transaction rolls the earlier write back.

The application does not claim that browser storage itself is archival. Users still need an exported backup if the browser profile or device may be cleared.

## Multi-tab behavior

Main and personal databases close open connections on `versionchange`, allowing an upgrading tab to proceed rather than leaving a permanently stale connection. Existing blocked-upgrade UX remains in RR5 for cases where another page cannot close promptly.

Successful restore broadcasts invalidation over the existing Library and PDF channels. IndexedDB remains authoritative; broadcasts are only refresh signals.

## Privacy boundary

RR8 introduces no network request, account, remote sync, analytics, or background upload path.

- Backup creation happens in the browser and downloads locally.
- Restore reads a user-selected local JSON file.
- Personal publication bytes remain in browser-local IndexedDB.
- There is **no automatic cloud sync**.

## Automated acceptance

RR8 requires:

1. source certification for schema/version ownership, backup boundaries, atomic restore, privacy, and production-gate ordering;
2. Node-native archive regression tests;
3. Chromium, Firefox, and WebKit desktop acceptance for migration, backup, restore, stale-release conflict handling, legacy PDF compatibility, personal-file preservation, and injected restore failure;
4. production execution of the same RR8 browser gate before the Pages artifact is uploaded.

Automation is not physical-device evidence. RR2/RR7 physical-device acceptance remains a separate v1.0 release requirement.

## Exit criteria

RR8 is complete when:

- supported historical storage upgrades preserve authoritative positions and personal bytes;
- backup/restore is available from the application without IndexedDB developer tools;
- corrupted archives cannot mutate current state;
- failed restores do not leave partial main-database writes;
- stale release progress cannot overwrite current native progress;
- portable state covers activity, favorites, EPUB/PDF progress, bookmarks, highlights/notes, settings, and personal-book metadata;
- ordinary backups are explicit about excluding private publication bytes;
- no automatic cloud synchronization is introduced;
- the dedicated RR8 browser workflow and production gate pass.
