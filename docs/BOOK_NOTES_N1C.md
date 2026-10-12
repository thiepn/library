# THIEPN Library — Book Notes N1C

Status: **stacked draft, not deployed**. N1A PR #165 → N1B PR #167 → N1C PR #168.

## Durable local recovery

N1C exports backup envelope **schemaVersion: 2**. It explicitly includes
`state.main.noteDocuments` (schemaVersion 1 collection) alongside existing
EPUB/PDF progress, bookmarks, highlights, site settings and personal metadata.
Reader books/cover binaries remain outside the JSON.

The main IndexedDB snapshot and replacement include noteDocuments **in the same
multi-store transaction** as favorites, reader progress and annotations, so a
failed notebook put aborts all main-state changes. Across the separate PDF,
settings and personal-book stores, existing compensating rollback also restores
the original main notebook snapshot on failure.

V2 imports demand an explicit notebook collection, validate each record and
reject duplicate IDs and singleton (workId, scopeKey) pairs **before writes**.
Legacy **V1** imports are supported and do **not** touch the V2 noteDocuments
store. An omitted category remains unchanged.

## Portable author-owned Markdown

A per-book .md export contains standard YAML frontmatter, stable note IDs,
note type, timestamps, optional chapter ID, edition/release/EPUB CFI/PDF page,
source annotation IDs and verbatim Markdown writing. It can be imported into
Obsidian without depending on remote links or credentials. Markdown is not a
lossless re-import format; the V2 JSON file remains the lossless backup.

## Account cross-device boundary

Existing THIEPN Account sync uses a user-owned RLS-scoped
`library_sync_state` row with revision-CAS RPC writes. The client now hashes
and validates V1/V2 envelopes including notebook records, considers notebook-only
state meaningful, and surfaces two-device conflicts rather than silently
merging edits.

A new **source-only** Supabase migration
`20261012093000_library_notebook_v2_downgrade_guard.sql` adds capability
`library_note_sync_capabilities()` and atomically disallows old V1 RPC writers
from overwriting a V2 snapshot while retaining all current authentication,
connection, grant and quota checks.

**No server migration is deployed.** Client cloud sync must fail closed unless
the server affirmatively advertises schema 2, revision CAS and the downgrade
guard. Thus, private cross-device notebook sync is IMPLEMENTED IN SOURCE but
NOT TESTED end-to-end and NOT AVAILABLE in production. Do not remove this
gate, bypass the Account permission checks, deploy the migration, or claim
multi-device PASS without a disposable server qualification and owner approval.

## Release gates

- Manual V2 backup: canonical Chromium round-trip and malformed/duplicate
  records rejection; confirm source locations survive.
- V1 import: preserves existing V2 notes, even when V1 includes old main-state
  categories.
- Main DB write fault: induced noteDocuments put failure preserves favorites
  and existing notes.
- Browser acceptance: fix and requalify inherited N1A/N1B; no relaxed layout
  bounds or weakened assertions.
- Private sync: authorized synthetic Account sessions, server migration
  installation, separate-device CAS conflicts and explicit conflict choice
  remain NOT_TESTED until a disposable PostgreSQL environment is approved.
- Physical devices, deploy, migration and merge remain NOT_TESTED / NOT DONE.

## Next (N1D)

Integrated usability polish, notebook failure/recovery paths, full cross-engine
regression evidence, physical-device/accessibility qualification, and migration
readiness review without altering production.
