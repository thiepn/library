# THIEPN Library Book Notes — N1D Integrated Qualification and Recovery Handoff

This is a **source-only stacked draft**, N1A #165 → N1B #167 → N1C #168 → N1D #169. No merge, migration, production-data access, release, DNS, credential or permission change is authorized.

## Independently verified starting point (October 12, 2026)

| Branch | Exact head | CI |
| --- | --- | --- |
| N1A #165 | 4ec1d62e24a0e570b25077b08d1fe0b356927ba7 | 8/8 PASS |
| N1B #167 | 867221e2b3613eb622fcc2068096867949a3bee7 | 9/9 PASS |
| N1C #168 | 6e94aeb60012761994da2ce563e3a7bce418883d | 8/8 PASS |

N1C exact-head Browser Acceptance 38221763123: **169 passed, 66 skipped**. Data Durability 38221763019 ran **5 + 20 + 19 passed, 2 skipped**. Accessibility 38221763105: **26 passed, 14 skipped**. The exact-head Quality, Offline, Security, Reading Ergonomics and physical-evidence *structure* runs succeeded. The certification/physical-release job was SKIPPED; **no human physical-device acceptance** is claimed.

Artifact inventories queried for N1C Browser, Durability, Accessibility and Physical Evidence reported **zero retained artifacts** in those workflows. Completed workflow job logs are the available first-party evidence; do not invent ZIP/hashes or original screenshots.

Previously reproduced N1B mobile PDF horizontal overflow was repaired on #167 and requalified. No reproduced N1C exact-head CI failure exists.

## N1D source changes and tests

- Explicit, manual **Download editor draft** (full notebook) and **Download draft** (EPUB/PDF/web modal). Neither action uploads, syncs, mutates source annotations, nor claims the editor draft has been persisted.
- The whole-book Markdown export refuses to silently omit unsaved notes. If a save fails, draft download stays available.
- Existing overview/chapter summary loading holds editor inputs read-only until the existing record lookup completes; stale asynchronous lookups are ignored.
- Unsaved in-reader text is protected with a best-effort browser unload prompt; on mobile, browsers may suppress prompts. The independent draft download remains available.
- Cross-engine Playwright tests cover three preserved synthetic source anchors (EPUB CFI, PDF page, legacy web chapter), independent Obsidian export, V2 JSON restore, lossless export/reimport, V1 partial backup preservation, unchanged EPUB progress, and explicitly denied IndexedDB write with a manual recovery file and unsaved text still visible.
- Node regression coverage checks source anchor recovery and SQL authorization/downgrade source contracts. **SQL source assertions are not equivalent to executing PostgreSQL.**

## Safe server migration handoff — NOT_TESTED

The migration `supabase/migrations/20261012093000_library_notebook_v2_downgrade_guard.sql` remains a Git source file only. N1D tightens malformed-null-field rejection (missing scope, body, annotations, timestamps or revision), rejects notebook payloads mislabeled V1, retains account identity and app_data.write checks and a single revision-CAS write with V2 downgrade denial. The client `assertNotebookSyncProtocol` intentionally fails closed unless a connected, authorized server advertises V2 and the atomic downgrade guard.

A disposable PostgreSQL/Supabase runtime was not available in this environment (no local psql/postgres/docker), and there is no approval to use real account/production databases. Therefore DB function execution, RLS isolation, service-role bypass attempts, synthetic two-device CAS races and crash-after-commit recovery are all **NOT_TESTED**. No cloud notebook sync should be enabled or advertised before independent qualification.

## Owner action and release gates

1. Reverify exact N1D head and completed CI. Do not substitute a prior green commit or an in-progress run.
2. Have a separate authorized reviewer examine permission/RLS/source migration changes, including security-definer search_path and SQL NULL-handling.
3. Set up a disposable, isolated PostgreSQL + synthetic Account grants/session; execute migration and two-device CAS/conflict and downgrade tests. Use no actual credentials or private records.
4. Test real desktop and mobile devices, screen readers, physical offline/eviction behavior, and export recovery.
5. Obtain explicit merge/migration/deploy authority separately and require production backup+rollback plan before any release. Until then status is **NO_GO**.

## N1E proposal

**N1E — Independent Staging/RLS Witness & Release Decision.** If an authorized disposable server and separate reviewer become available, perform permission-qualified PostgreSQL migration tests, adversarial two-device sync and mobile physical usability. Otherwise keep the guard enabled and produce a minimal, exact-head reviewer handoff without pretending an approval or deployment occurred.
