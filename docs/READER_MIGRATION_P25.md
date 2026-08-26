# P25 — Existing Book Migration

## Status

P25 turns the canonical `/works/[slug]/read` route into a release-driven migration boundary between the native EPUB reader and the preserved Markdown reader.

The migration is publication-driven, not title-driven. There is no allowlist of current Library books in reader code.

## Governing rule

A work moves to the native reader when its resolved active release exposes an EPUB artifact through the existing release registry. If no active EPUB publication resolves but the verified Markdown payload is materialized, the work remains on the existing chapter reader.

```text
work manifest
→ active release resolver
→ EPUB publication candidate?
   ├─ yes → native P24 EPUB stack
   ├─ no, verified web payload → legacy Markdown launcher
   └─ neither → no reader route
```

This preserves the publication contract as the source of truth. P25 does not contain book slugs, title-specific exceptions, or manually maintained migration switches.

## Native route

For an eligible EPUB release, `/works/[slug]/read` now renders:

```text
EpubReaderLayout
→ ReaderShell
→ mountReaderPublicationWithCompatibilityHarness
→ P24 compatibility
→ P23 accessibility
→ P22 desktop/tablet
→ P21 mobile
→ P20 highlights and notes
→ P19 bookmarks
→ P18 in-book search
→ native TOC/navigation/progress/settings
→ EPUB.js
```

The resolved publication object carries the work ID, slug, title, language, edition, release version, EPUB artifact metadata, and optional PDF artifact metadata into the native stack. That keeps progress, bookmarks, highlights, notes, search caches, and resume state bound to the exact edition/release identity already established in earlier phases.

Canonical production media URLs are localized to the current Library base before EPUB.js opens them. This keeps the web rendition same-origin while preserving the release artifact identity and hash metadata.

## Legacy fallback

P25 does not delete or rewrite the existing Markdown reader.

When an active EPUB publication does not resolve but `webMaterialized` is true, `/works/[slug]/read` retains the existing behavior:

1. load the legacy saved chapter progress;
2. validate the saved chapter against the materialized chapter list;
3. redirect to the saved chapter or first chapter;
4. render that chapter through `ReaderLayout.astro`.

Existing `/works/[slug]/read/[chapter]` URLs remain generated and functional. This is intentional for rollback, old links, and the later compatibility-bridge phase.

## Publication lifecycle

P25 does not convert Markdown into EPUB at request time and does not manufacture EPUB releases from old content.

A future rewritten edition migrates without reader-code changes:

1. the rewritten publication is generated and validated;
2. its release registry entry becomes the active release;
3. the work enables EPUB and the active release resolves a valid EPUB artifact;
4. the generic migration resolver selects `native-epub`;
5. `/works/[slug]/read` opens that exact edition in the native reader.

If EPUB is disabled or unavailable while the verified web payload still exists, the same route stays on `legacy-web`.

## Current migration behavior

The repository audit confirmed that the present catalog contains both kinds of work: active releases with EPUB enabled and at least one publication whose work manifest explicitly has EPUB disabled. P25 intentionally honors those publication facts rather than normalizing every existing book to the same format.

The migration decision therefore remains stable even while books are rewritten and republished.

## Language and accessibility

`EpubReaderLayout.astro` now accepts the publication language and places it on the document `<html lang>` attribute. The full P23 accessibility layer remains part of every migrated native reader session.

## Failure boundary

A native launch failure is surfaced through the existing reader error state rather than replacing the page with an unhandled exception. Runtime reader resources are destroyed on page navigation.

P26 is responsible for expanding fallback and recovery behavior beyond this migration boundary.

## Phase boundary

P25 does:

- migrate eligible existing releases through the canonical `/read` route;
- preserve legacy reading for ineligible releases;
- preserve all old chapter URLs;
- preserve PDF artifacts and the release registry;
- establish a generic future-edition migration rule.

P25 does not:

- delete Markdown chapters;
- redirect historical chapter URLs into CFIs;
- remove `ReaderLayout.astro`;
- convert old progress percentages into synthetic EPUB CFIs;
- weaken the EPUB publication contract;
- remove PDF fallback;
- perform final legacy cleanup.

Those concerns remain assigned to P26, P29, P34, and P35 as appropriate.
