# L17B — Publication Payload Materialization & Reader Activation

## Objective

Materialize the frozen `AI for the Kingdom` rc4 publication without reconstructing, paraphrasing, or silently substituting source text.

## Frozen release contract

Release: `1.0.0-rc4`

Reader payload:

- 57 native Markdown reader files
- 4 front-matter entries
- 8 Part openings
- 41 numbered chapters
- 1 conclusion (`Go`)
- 3 back-matter entries
- 50,092 validation words
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

The per-file identity/order/Part/reading-time contract remains source-controlled at `src/content/works/ai-for-the-kingdom/recovery/l17b-expected.json`.

## Frozen package recovery — complete

On 2026-08-24 the original L17 package was supplied again as exact bytes.

Verification completed before any repository publication change:

```text
package bytes:   2,034,059 / 2,034,059
package SHA-256: exact match
reader files:    57 / 57
validation words: 50,092
footnotes:       57 references / 57 definitions
PDF:             exact frozen size + SHA-256
EPUB:            exact frozen size + SHA-256
cover:           exact frozen size + SHA-256
fidelity:        PASS, normalized ratio 1.000
```

The previous frozen-package recovery problem is therefore closed. No reconstructed substitute edition is required.

## Reader materialization — complete

The exact 57 Markdown files were staged as a single Git tree and submitted through PR #6.

PR #6 contained exactly 57 added reader files and no unrelated application changes. Its GitHub Actions Quality workflow passed:

- frozen pnpm dependency installation;
- source certification;
- content validation;
- Astro production build;
- Pagefind/deploy preparation through the normal build pipeline.

PR #6 was squash-merged into `main` as:

```text
f2e82708641667536642a4332de4a396d21fe92b
```

The Web Reader payload is now materially present in the canonical repository. The former `L17_READER_PAYLOAD` blocker is resolved.

## Reader activation

Astro 6 loads native Markdown/MDX through `src/content.config.ts`. Public Reader routes are mounted under:

```text
/library/works/[slug]/read
/library/works/[slug]/read/[chapter]
```

A frozen Work is considered Web-materialized only when all expected filenames are present. The rc4 Work now satisfies that filename materialization boundary.

The Reader provides deterministic ordering, desktop/mobile contents navigation, previous/next navigation, generated chapter headings, Pagefind indexing, local reader controls, browser-local progress/resume state, footnote styling, and document-owned scrolling.

## Verification

The repository verifier remains:

```bash
pnpm l17b:verify
```

For full package/media certification:

```bash
L17B_PACKAGE=/absolute/path/AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip \
L17B_MEDIA_DIR=/absolute/path/to/recovered-media \
pnpm l17b:verify
```

Package/media bytes and SHA-256 values must match the frozen contract exactly.

## Historical registry provenance

The original rc4 registry recovered from retained publication evidence is preserved at:

```text
src/content/works/ai-for-the-kingdom/recovery/l17-original-release-registry.yaml
```

It is provenance only. Historical metadata does not prove that the immutable R2 objects currently exist.

## Binary activation rule

The live canonical registry remains deliberately absent until Cloudflare R2 has accepted and returned the exact frozen assets:

```text
src/publications/releases/ai-for-the-kingdom/1.0.0-rc4.yaml
```

`scripts/l17b-write-release.mjs` is fail-closed. It requires an R2 readback verification marker and independently verifies PDF, EPUB, and cover byte sizes and SHA-256 values before writing the canonical registry.

The R2 activation sequence is:

1. reconstruct or obtain the already-verified exact package inside the isolated release runner;
2. verify package bytes and SHA-256 again;
3. extract and verify the three frozen binary assets;
4. upload PDF, EPUB, and cover to immutable R2 keys;
5. download all three R2 objects back;
6. verify the readback bytes against the frozen hashes;
7. create the R2 verification marker;
8. write the canonical registry through the guarded writer;
9. run the complete release certification suite;
10. promote only the verified registry to `main`;
11. allow the normal deployment workflow to deploy `https://thiepn.dev/library`.

## Cloudflare credential probe — blocked

A same-repository GitHub Actions probe was run after reader materialization using PR #7 and the dedicated `L17B R2 Ingress` workflow.

The workflow passed checkout and then failed immediately at:

```text
Require Cloudflare release credentials
```

All package reconstruction, R2 upload, R2 readback, registry promotion, and deployment steps were skipped.

This directly confirms that GitHub Actions does not currently receive the required Cloudflare release credentials.

## Remaining release gate

Only the production Cloudflare credential/R2 activation gate remains:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

After those repository secrets are configured, PR #7 can be reused as the isolated binary ingress trigger. The exact package does not need to be reconstructed from historical evidence again; it has already been recovered and verified.

The remaining rc4 work is therefore production activation, not application development or publication-content recovery.
