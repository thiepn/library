# P29 — Old Reader Compatibility Bridge

P29 defines how the historical Markdown reader coexists with the native EPUB reader during migration.

## Goals

- Preserve every existing `/works/[slug]/read/[chapter]` URL while legacy Markdown remains materialized.
- Preserve old Markdown reading positions even after native EPUB progress begins to be saved.
- Keep `/works/[slug]/read` as the canonical reader boundary established in P25.
- Provide an explicit compatibility path back into the old reader when needed for recovery or historical bookmarks.
- Never infer an EPUB CFI from an old chapter ID or percentage unless a future release contract provides a trustworthy mapping.

## Canonical routing

`/works/[slug]/read` continues to resolve through `resolveReaderMigration(work)`:

1. eligible active EPUB release → native EPUB reader;
2. otherwise verified materialized Markdown → legacy reader;
3. otherwise unavailable.

P29 does not change that priority.

When a migrated title still has materialized Markdown, `/works/[slug]/read?legacy=1` is an explicit compatibility entrypoint. It reads only the saved legacy chapter record, validates the chapter ID against the currently materialized legacy chapter list, and redirects to that historical chapter URL. If no valid saved legacy chapter exists, it opens the first verified legacy chapter.

The P26 web fallback now uses this compatibility entrypoint instead of always opening chapter one.

## Historical chapter URLs

Existing `/works/[slug]/read/[chapter]` pages remain real rendered Markdown pages. P29 intentionally does not automatically redirect them to the native reader.

When the same work now has an eligible native EPUB release, the legacy page:

- displays a `Legacy web reader` compatibility notice;
- provides an explicit `Open current reader` link;
- canonicalizes metadata to `/works/[slug]/read`;
- uses `noindex,follow` so the compatibility URL is preserved without competing with the current reader as the canonical reading surface.

When the work still relies on Markdown, the page behaves as the normal primary reader and is not marked as a migrated compatibility page.

## Progress isolation

Before P29, the historical Markdown record and native EPUB record both occupied the `progress` object store at key `workId`. P12 protected native progress from legacy writes, but the first native save could still replace the historical Markdown position.

P29 upgrades the Library database to version 7 and adds:

`legacyProgress` — key path `workId`

During the v7 upgrade, any pre-existing legacy chapter progress record still in `progress` is copied into `legacyProgress` before native reading continues.

After P29:

- Markdown reader reads/writes `legacyProgress`;
- EPUB reader continues to read/write `progress`;
- `getProgress` and `setProgress` remain exported as wrappers around the new legacy APIs for old cached bundles and historical call sites;
- native progress schema, release identity, bookmarks, annotations, highlights, notes, reading sessions, favorites, and settings are unchanged.

A lazy import path also recovers a pre-P29 legacy record from `progress` if the sidecar is unexpectedly empty.

## No automatic position translation

P29 deliberately does not convert:

- old chapter IDs → EPUB spine hrefs;
- old Markdown percentages → EPUB percentages;
- old percentages → EPUB CFIs.

This is required because a rewritten or newly published edition can add, remove, reorder, split, or substantially rewrite chapters. A percentage such as 43% in the old Markdown payload is not a reliable statement about 43% of a new EPUB release.

Native progress therefore begins and resumes only from native release-bound EPUB state. Legacy progress resumes only inside the legacy reader.

## Offline/PWA continuity

Historical ReaderLayout pages now expose the same manifest metadata and call `registerLibraryPwa()`. A reader entering the Library through an old bookmarked chapter therefore still participates in the P28 scoped offline shell.

## Generic migration rule

No title, chapter, current book list, or publication-specific mapping is embedded in the bridge. Compatibility is determined only from:

- whether materialized Markdown exists;
- whether `resolveReaderMigration(work)` selects an active native EPUB release;
- the verified list of legacy chapter IDs for that work.

This keeps P29 valid when the current catalog is rewritten and republished.

## Removal boundary

P29 is a bridge, not permission to remove legacy assets. Historical chapter routes and the legacy progress sidecar remain until the later final migration/legacy-removal phase explicitly certifies that they are no longer needed.
