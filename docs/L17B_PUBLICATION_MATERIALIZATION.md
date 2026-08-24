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

The Reader provides deterministic ordering, desktop/mobile contents navigation, previous/next navigation, generated chapter H1s, Pagefind indexing, local reader controls, browser-local progress/resume state, footnote styling, and document-owned scrolling.

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

## Recovered historical registry

The original rc4 release-registry record has now been recovered from retained File Library evidence and preserved at:

```text
src/content/works/ai-for-the-kingdom/recovery/l17-original-release-registry.yaml
```

This file is **provenance only**. Its presence does not activate downloads and must never be copied mechanically into the canonical live registry. Historical release metadata proves the intended release identity; it does not prove the corresponding immutable R2 objects currently exist.

## Binary activation rule

PDF/EPUB controls become available only after immutable R2 objects have been uploaded, downloaded back, and verified against the frozen hashes. Only then may the live registry exist at:

```text
src/publications/releases/ai-for-the-kingdom/1.0.0-rc4.yaml
```

`scripts/l17b-write-release.mjs` is fail-closed. It requires the R2 readback verification marker and independently recomputes the byte size and SHA-256 of the read-back PDF, EPUB, and cover before writing the canonical registry.

The L17B GitHub Actions workflow creates that marker only after Wrangler has downloaded all three remote R2 objects and `pnpm l17b:verify` has accepted them.

## L17B-2 execution sequence

The implemented production path is:

1. attach the exact frozen ZIP to a GitHub Release (default tag `l17b-frozen-payload`);
2. manually dispatch `L17B-2 Frozen Payload Injection`;
3. download the package into the runner;
4. verify package byte size and SHA-256 before extraction;
5. inject exactly the 57 manifest-listed Markdown files;
6. stage and verify the exact PDF, EPUB, and cover;
7. upload all three assets to immutable R2 keys;
8. download all three R2 objects back;
9. re-run frozen hash verification on the readback directory;
10. write the R2 verification marker;
11. write the canonical release registry through the guarded writer;
12. run the complete release certification suite;
13. commit the verified chapters and canonical registry to `main`;
14. allow the ordinary production deployment gate to deploy `https://thiepn.dev/library`.

The dependency step is pinned to the committed pnpm lockfile and uses `pnpm install --frozen-lockfile`.

## Exhaustive recovery audit — 2026-08-24

### ChatGPT File Library

The File Library retains the package SHA-256 sidecar, L17 package manifest, validation report, fidelity audit, original rc4 registry, frozen online PDF, publication proofs, and EPUB reference material. It does not expose the exact `AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip` as transferable raw bytes to this runtime.

The retained checksum sidecar records that the original package existed at `/mnt/data/AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip` when L17 was produced. That original runtime path is not present in the current execution environment.

### Google Drive / Dropbox

Exact package-name and publication-title searches did not find a materializable copy of the L17 package.

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

The exact rc4 package therefore cannot be reconstructed from reachable Git history without inventing missing compressed bytes. The incomplete recovery chunks must not be treated as publication source.

### Cloudflare publication runtime

R2 publication and production deployment require GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The release workflow remains blocked until those credentials are configured.

## Application readiness

The Library application itself has completed a dependency-connected build using the committed pnpm 11 lockfile. The verified build reported:

```text
astro check: 0 errors, 0 warnings, 0 hints
content validation: pass with materialization warnings only
Astro static build: pass
Pagefind indexing: pass
Cloudflare deploy preparation: pass
```

The application/integration layer and L17B-2 release machinery are complete and fail-closed. The remaining rc4 work is external byte/credential materialization, not feature development.

## Remaining blockers

```text
L17_READER_PAYLOAD — exact frozen ZIP / 57 native reader files unavailable
L17_RELEASE_REGISTRY — intentionally absent until verified R2 readback
CLOUDFLARE_RELEASE_CREDENTIALS — required for R2 and production deployment
```

To preserve publication fidelity, there are only two valid publication paths:

1. supply the exact frozen package (or the exact 57 Markdown files plus all three frozen binary assets) and complete the rc4 verification pipeline; or
2. explicitly authorize a **new reconstructed edition** from retained EPUB/proof sources, with a new release identity rather than falsely presenting it as the frozen rc4 payload.

Until one of those paths is completed, Reader/PDF/EPUB activation remains disabled for `AI for the Kingdom`.
