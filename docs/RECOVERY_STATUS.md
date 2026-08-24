# Library recovery status

Date: 2026-08-24

## Recovery result

The canonical Library application has been reconstructed in `thiepn/library`. Application architecture, dependency recovery, and the frozen `AI for the Kingdom` reader payload are complete.

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

Authoritative publication contract:

- Work ID: `ai-for-the-kingdom`
- release: `1.0.0-rc4`
- frozen package: `AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip`
- package bytes: 2,034,059
- package SHA-256: `1c6f831ca9c3a48031121dc6129d39cb66f5ad521d53c3e9f40153f8c9f776b7`
- native reader files: 57
- numbered chapters: 41
- conclusion: 1
- Part openings: 8
- validation word total: 50,092
- footnote references / definitions: 57 / 57
- PDF: 1,792,545 bytes, SHA-256 `8aa58f8eb291c9c5abb4c0ebc633032ae2c4a3703c443e7c3779f38646c707bd`
- EPUB: 568,942 bytes, SHA-256 `8931f8578cbd7e09ccf31385047f8eb5d58ea5a74a683c79669a51d2b9e59e1f`
- cover: 56,752 bytes, SHA-256 `938830415749fff85b864248c7e302624f17d50bbe5336de1009538fe040df94`

The author/byline remains intentionally unspecified. Do not infer it from repository ownership or profile data.

## Frozen package recovery — complete

On 2026-08-24 the original package was supplied again as exact bytes. Verification succeeded before repository materialization:

```text
bytes:   2034059
sha256:  1c6f831ca9c3a48031121dc6129d39cb66f5ad521d53c3e9f40153f8c9f776b7
reader:  57/57
words:   50092
notes:   57 references / 57 definitions
PDF:     exact frozen hash
EPUB:    exact frozen hash
cover:   exact frozen hash
```

The 57 native Markdown reader files were staged as a single Git tree and submitted as PR #6. The PR changed exactly 57 files and no unrelated files. GitHub Actions then passed:

- frozen pnpm dependency install;
- source certification;
- content validation;
- full production build.

PR #6 was squash-merged into `main` as commit `f2e82708641667536642a4332de4a396d21fe92b`.

The former `L17_READER_PAYLOAD` blocker is therefore resolved.

## Release provenance and canonical registry

The original historical rc4 registry remains preserved at:

```text
src/content/works/ai-for-the-kingdom/recovery/l17-original-release-registry.yaml
```

It is provenance only. The canonical live registry remains:

```text
src/publications/releases/ai-for-the-kingdom/1.0.0-rc4.yaml
```

and is deliberately absent until immutable R2 readback verifies the exact frozen binaries.

## R2 activation probe

A same-repository GitHub Actions probe was run after reader recovery. It failed at the first Cloudflare credential gate, before package reconstruction or any R2 action. The subsequent upload/readback/promotion steps were skipped.

This establishes the remaining operational blocker directly rather than inferring it from configuration.

## Remaining blocker

Only Cloudflare release credentials remain:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Once those GitHub Actions secrets exist, the prepared L17B ingress workflow can:

1. reconstruct the already-verified frozen package in an isolated runner;
2. re-verify its byte size and SHA-256;
3. verify the reader and all three local binaries;
4. upload PDF, EPUB, and cover to immutable R2 keys;
5. download all three objects back;
6. verify readback bytes against the frozen hashes;
7. create the guarded canonical release registry;
8. run the complete release certification suite;
9. promote only the verified registry to `main`;
10. allow the normal production deployment gate to deploy the final release.

The remaining work is therefore production credential/R2 activation, not application development or publication-content recovery.
