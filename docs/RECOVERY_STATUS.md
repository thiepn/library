# Library recovery status

Date: 2026-08-24

## Recovery result

The canonical Library application has been reconstructed in `thiepn/library` and is no longer blocked on application architecture or dependency recovery.

The current tree uses the retained production decisions:

- Astro 6 static application;
- `/library` mounted at `https://thiepn.dev/library`;
- Archive Editorial visual language;
- Pagefind static full-text search;
- Cloudflare Workers Static Assets;
- Cloudflare R2 as the immutable publication-binary boundary;
- public reading independent from optional AI.

The committed pnpm 11.21.0 lockfile is present, dependency-connected validation/build has passed, and the deployment workflow is intentionally fail-closed.

## L17 — AI for the Kingdom

Recovered authoritative publication contract:

- Work ID: `ai-for-the-kingdom`
- release: `1.0.0-rc4`
- frozen package: `AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip`
- package bytes: 2,034,059
- package SHA-256: `1c6f831ca9c3a48031121dc6129d39cb66f5ad521d53c3e9f40153f8c9f776b7`
- native reader files expected: 57
- numbered chapters: 41
- conclusion: 1
- Part openings: 8
- validation word total: 50,092
- footnote references / definitions: 57 / 57
- PDF: 1,792,545 bytes, SHA-256 `8aa58f8eb291c9c5abb4c0ebc633032ae2c4a3703c443e7c3779f38646c707bd`
- EPUB: 568,942 bytes, SHA-256 `8931f8578cbd7e09ccf31385047f8eb5d58ea5a74a683c79669a51d2b9e59e1f`
- cover: 56,752 bytes, SHA-256 `938830415749fff85b864248c7e302624f17d50bbe5336de1009538fe040df94`

The author/byline remains intentionally unspecified. Do not infer it from repository ownership or profile data.

## Recovered release provenance

The original L17 rc4 release-registry record has been recovered from retained publication evidence and preserved at:

```text
src/content/works/ai-for-the-kingdom/recovery/l17-original-release-registry.yaml
```

It is provenance only. It is deliberately **not** copied into the live canonical release path because historical metadata does not prove that immutable R2 objects currently exist.

The canonical live registry remains:

```text
src/publications/releases/ai-for-the-kingdom/1.0.0-rc4.yaml
```

and may be written only after verified R2 readback.

## L17B-2 release pipeline

The repository now has a complete fail-closed materialization path:

1. obtain the exact frozen ZIP from the `l17b-frozen-payload` GitHub Release;
2. verify ZIP byte size and SHA-256 before extraction;
3. inject exactly the 57 expected native Markdown files;
4. verify reader identity/frontmatter/ordering/footnotes;
5. verify PDF, EPUB, and cover bytes against the frozen hashes;
6. upload the three immutable assets to R2;
7. download all three objects back from R2;
8. verify the downloaded bytes again;
9. create an R2-verification marker only after that readback passes;
10. allow `scripts/l17b-write-release.mjs` to write the canonical registry only when the marker exists and all three readback assets still match their frozen hashes;
11. run the full release certification suite;
12. commit the verified reader payload and canonical registry;
13. allow the normal production deployment workflow to proceed.

## Remaining blockers

Only external materialization remains:

1. **Frozen package ingress** — the exact 2,034,059-byte L17 ZIP is not materializable from the current ChatGPT File Library runtime, Google Drive, Dropbox, or reachable Git history. It must be supplied as exact bytes; reconstructing the missing rc4 package from an older EPUB/PDF is not permitted.
2. **Cloudflare release credentials** — GitHub Actions must have `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` configured before R2 upload/readback and production deployment can run.

Until both conditions are satisfied, the 57-file Reader and PDF/EPUB release controls remain disabled. This is intentional release-integrity behavior, not unfinished application functionality.
