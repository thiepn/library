# RR8 — Data durability, migration, backup, and portability

## Status

Implementation and automated acceptance are defined in this phase branch. RR8 is not release-certified until the dedicated workflow and the existing release gates pass on the exact pull-request head.

## Storage topology

Thiepn Library is local-first and intentionally has more than one browser persistence boundary:

| State | Backend | Current persisted schema |
| --- | --- | --- |
| Favorites | `thiepn-library` IndexedDB | record v1; DB v9 |
| Native EPUB progress | `thiepn-library` IndexedDB | record v2; DB v9 |
| Legacy web-reader progress | `thiepn-library` IndexedDB | record v1; DB v9 |
| Native EPUB bookmarks | `thiepn-library` IndexedDB | record v2; DB v9 |
| EPUB annotations/highlights/notes | `thiepn-library` IndexedDB | native record v2; supported legacy annotation shape retained |
| Reading activity | `thiepn-library` IndexedDB | record v1; DB v9 |
| PDF progress/bookmarks | `thiepn-library-pdf-reader` IndexedDB | record v1; DB v1 |
| Native EPUB reader settings | localStorage | record v1 |
| PDF reader settings | localStorage | record v1 |
| Site appearance | localStorage | portable settings v1 |
| Legacy web-reader settings | localStorage | portable settings v1 |
| Personal EPUB/PDF records and binaries | `thiepn-library-personal-books` IndexedDB | record v1; DB v3 |
| Restored personal-book relink manifest | localStorage | metadata v1 |

Reserved/legacy auxiliary stores in the main database are not treated as authoritative user state unless an active feature owns them. RR8 does not delete those stores.

## Forward migrations

### Main database: v8 → v9

DB v9 adds explicit schema tags to the two active record families that previously used unversioned shapes:

- favorites become `schemaVersion: 1`;
- legacy web-reader progress becomes `schemaVersion: 1`.

The upgrade cursor normalizes existing records in place. Pre-v7 shared progress remains recoverable through the P29 sidecar migration and is normalized before being copied. Native EPUB v2 progress is not rewritten as legacy progress.

Readers still accept the historical untagged favorite/legacy-progress shapes as a recovery path, so a partially upgraded or restored browser does not lose valid authoritative position data.

### Personal-book database: v2 → v3

DB v3 adds `schemaVersion: 1` to existing personal-book records without rewriting or re-encoding their stored EPUB/PDF binary. Historical `ArrayBuffer` files remain readable and normalize to `Blob` at the API boundary.

## Backup format

Manual backups use a deterministic JSON envelope:

- `format: "thiepn-library-backup"`;
- `schemaVersion: 1`;
- `exportedAt` ISO timestamp;
- independently versioned state/category payloads.

Current exports contain:

- favorites;
- native EPUB progress, including exact CFI and furthest progress;
- legacy web-reader progress;
- EPUB bookmarks;
- EPUB annotations/highlights/notes;
- reading activity;
- PDF progress and bookmarks;
- EPUB/PDF/site/legacy-reader settings;
- personal-book identity and descriptive metadata.

Arrays are sorted by stable identity before serialization. The export timestamp is intentionally variable; the state payload ordering is deterministic.

Stale publication releases are preserved rather than silently upgraded or discarded. Existing reader resume policy remains responsible for deciding whether a stored exact-release position is currently usable.

## Personal-book binary boundary

The default JSON backup **never includes personal EPUB/PDF bytes or cover blobs**. Each personal-book metadata entry carries its SHA-256 identity, format, filename, size, and descriptive metadata.

After restoring on a fresh browser, missing personal books are staged in a relink manifest. Re-importing a matching EPUB/PDF verifies the file through the normal publication inspection path, recomputes its SHA-256 hash, reconnects the restored metadata, and clears that pending relink entry only after the book write succeeds.

A future encrypted archive that embeds personal binaries is optional scope and is not implied by RR8 v1. It would require an explicit user choice plus a separately reviewed encryption/recovery design.

## Restore semantics

Restore is **replace-present-categories**:

- if a category exists in the archive, that browser category is replaced by the validated archive records;
- if a category is omitted, the existing browser category is untouched;
- duplicate canonical identities are rejected before any write rather than resolved by insertion order;
- PDF and personal-book identity fields are checked against their canonical release/SHA-derived identities before restore;
- personal-book binaries already present locally are not deleted by metadata restore;
- personal metadata whose SHA-256 file is absent becomes a relink requirement.

This makes partial recovery possible without pretending that an incomplete archive is a full snapshot.

## Atomicity and rollback

The whole product cannot use one native transaction because authoritative data spans two IndexedDB databases plus localStorage. RR8 therefore uses this contract:

1. Parse and validate the entire archive before the first write.
2. Snapshot all supported current state required for compensation.
3. Replace main-database categories in one IndexedDB transaction.
4. Replace PDF progress/bookmarks in one PDF IndexedDB transaction.
5. Apply versioned settings and the personal relink manifest.
6. If any step fails, restore the pre-import main snapshot, PDF snapshot, settings, and relink manifest.
7. Surface a distinct error if compensation itself cannot complete.

A failed transaction inside either IndexedDB database remains natively atomic. The compensating layer supplies the cross-backend guarantee required by the product contract.

## Corruption and conflict policy

- Malformed JSON: reject before writes.
- Wrong backup format: reject before writes.
- Future/unknown backup schema: reject before writes; never guess.
- Invalid category/record: reject the complete import before writes.
- Duplicate canonical identity: reject the complete import before writes; never let array order select a winner.
- Inconsistent PDF release identity or personal-book SHA-derived identity: reject before writes.
- Corrupt records already present locally: export only recognized valid current/supported legacy records.
- Quota, denied storage, abort, or transaction failure during restore: roll back committed earlier backends.
- Multiple tabs blocking a database upgrade: surface the existing explicit blocked-storage error and leave current state intact.
- Unavailable/stale publication release: preserve identity and progress; do not remap CFIs/pages heuristically.

## User surface

`/backup` provides the supported no-database-tools path for inspection and movement:

- **Export backup** downloads the JSON archive.
- **Choose backup** validates and restores a selected JSON file.
- The page states that personal files are excluded and reports how many must be re-imported.
- The site footer links to Backup so the capability is discoverable.

## Cloud-sync boundary

RR8 is manual portability, not account sync. Thiepn Library does not automatically upload or synchronize reading state or personal books. Any future cloud sync would need its own identity, merge, conflict, privacy, authentication, and encryption design.

## Automated acceptance

`tests/e2e/data-portability.spec.ts` covers:

1. full current-state export/restore round trip;
2. absence of personal binaries from JSON;
3. partial restore preserving omitted categories;
4. corrupt/future archive rejection before mutation;
5. injected cross-backend write failure followed by compensation;
6. historical main DB v8 and personal DB v2 upgrades into versioned portable state.

`tests/e2e/data-portability-conflicts.spec.ts` additionally verifies that a duplicate canonical identity is rejected before it can replace current state.

The RR8 workflow also re-runs RR5 storage-reliability coverage in the service-worker-enabled offline profile so quota, interruption, denied storage, blocked upgrade, offline personal books, cache isolation, and ephemeral-session behavior remain protected.

## Exit criterion

RR8 can close when the exact pull-request head passes source certification, build/type checking, the dedicated cross-engine portability suite, existing storage-reliability tests, and the repository’s other required checks. Production Pages artifact upload is also gated on RR8 after RR7. This phase does not waive the separate physical-device evidence gate or any unresolved production deployment gate.
