# L17B — Publication Payload Materialization & Reader Activation

## Objective

Materialize the frozen `AI for the Kingdom` publication without reconstructing, paraphrasing, or silently substituting source text.

## Recovered authoritative payload contract

Release: `1.0.0-rc4`

Reader payload:

- 57 native Markdown reader files
- 4 front-matter entries
- 8 Part openings
- 41 numbered chapters
- 1 conclusion (`Go`)
- 3 back-matter entries
- 50,092 total validation words
- 57 chapter-local footnote references
- 57 chapter-local footnote definitions

Frozen package:

- `AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip`
- 2,034,059 bytes
- SHA-256 `1c6f831ca9c3a48031121dc6129d39cb66f5ad521d53c3e9f40153f8c9f776b7`

Binary artifacts:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| PDF | 1,792,545 | `8aa58f8eb291c9c5abb4c0ebc633032ae2c4a3703c443e7c3779f38646c707bd` |
| EPUB | 568,942 | `8931f8578cbd7e09ccf31385047f8eb5d58ea5a74a683c79669a51d2b9e59e1f` |
| Cover | 56,752 | `938830415749fff85b864248c7e302624f17d50bbe5336de1009538fe040df94` |

The complete per-file identity/order/Part/reading-time manifest is source-controlled at `src/content/works/ai-for-the-kingdom/recovery/l17b-expected.json`.

## Reader activation

Astro 6 loads native Markdown/MDX through `src/content.config.ts`. The public Reader routes are mounted under the Library base path:

```text
/library/works/[slug]/read
/library/works/[slug]/read/[chapter]
```

A Work with a frozen recovery manifest is `webMaterialized` only when every expected reader filename exists. Partial imports therefore remain invisible to public Reader routing.

The Reader provides:

- deterministic order;
- desktop and mobile contents navigation;
- previous/next navigation;
- generated chapter H1;
- Pagefind chapter indexing;
- local text-size and line-measure controls;
- browser-local progress persistence and resume routing;
- footnote styling;
- document-owned scrolling.

## Verification command

```bash
pnpm l17b:verify
```

This requires the exact 57 reader files and verifies frontmatter identity, order, Part assignment, publication state, estimated reading time, and total footnote reference/definition counts.

Optional raw package verification:

```bash
L17B_PACKAGE=/absolute/path/AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip pnpm l17b:verify
```

Optional binary verification:

```bash
L17B_MEDIA_DIR=/absolute/path/to/recovered-media pnpm l17b:verify
```

When supplied, package/media bytes and SHA-256 hashes must exactly match the frozen L17 contract.

## Binary activation rule

The historical L17 package release metadata is not treated as proof that R2 objects exist. PDF/EPUB controls become available only after the ordinary L10 pipeline has verified remote immutable objects and written:

```text
src/publications/releases/ai-for-the-kingdom/1.0.0-rc4.yaml
```

This prevents a metadata-only recovery from creating broken download controls.

## Exhaustive recovery audit — 2026-08-24

The retained publication package was checked across every materializable source available to the release workflow.

### ChatGPT File Library

The File Library retains the package SHA-256 sidecar, L17 package manifest, validation report, fidelity audit, publication proofs and an EPUB reference. It does not expose the exact `AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip` as transferable raw bytes to this runtime.

The retained checksum sidecar records that the original package existed at `/mnt/data/AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip` when L17 was produced. That original runtime path is not present in the current execution environment.

### Google Drive / Dropbox

Earlier exact-name and publication-title searches did not find a materializable copy of the L17 package.

### Git repository history

The legacy branch `l17/ai-for-the-kingdom-publication` was exhaustively scanned on a GitHub-hosted runner.

Results:

- 17 reachable commits;
- 17 unique reachable blobs;
- six staged recovery chunks only: `part00` through `part05`;
- chunk sizes: 15,000 / 15,000 / 15,000 / 15,000 / 15,000 / 31,349 bytes;
- combined encoded recovery data: 106,349 characters;
- no alternate historical versions of any chunk;
- no blob of 2,034,059 bytes;
- no hidden/deleted reachable ZIP, XZ, Base64-XZ or other large payload blob;
- the staged Base64/XZ stream ends mid-stream and cannot be completed from XZ footer invariants;
- the largest actual commit-state payload is the same incomplete six-part stream.

The audit terminated with:

```text
FROZEN_PACKAGE_NOT_FOUND_IN_REACHABLE_GIT_HISTORY
```

This means the exact rc4 package cannot be reconstructed from reachable Git history without inventing missing compressed bytes. The incomplete recovery chunks must not be treated as publication source.

### Cloudflare publication runtime

The GitHub Actions environment currently has no configured `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`, so immutable R2 publication/upload verification cannot run yet.

## Application readiness

The Library application itself has completed a dependency-connected GitHub Actions build using the committed pnpm 11 lockfile. The verified build reported:

```text
astro check: 0 errors, 0 warnings, 0 hints
content validation: pass with materialization warnings only
Astro static build: pass
Pagefind indexing: pass
Cloudflare deploy preparation: pass
```

Source certification therefore has only two publication blockers:

```text
L17_READER_PAYLOAD — exact 57 native reader files unavailable
L17_RELEASE_REGISTRY — canonical registry awaits immutable R2 verification
```

## Current materialization boundary

The application/integration layer is complete and fail-closed. The remaining rc4 release work is external byte materialization, not further reconstruction of the application.

To preserve publication fidelity, there are only two valid paths:

1. supply the exact frozen package (or exact 57 Markdown files plus the three frozen binary assets) and verify it against the recorded hashes; or
2. explicitly authorize a **new reconstructed edition** from retained EPUB/proof sources, with a new release identity rather than falsely presenting it as the frozen rc4 payload.

Until one of those paths is chosen, Reader/PDF/EPUB activation must remain disabled for `AI for the Kingdom`.
