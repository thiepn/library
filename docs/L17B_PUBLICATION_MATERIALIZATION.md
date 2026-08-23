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

Astro 6 now loads native Markdown/MDX through `src/content.config.ts`. The public Reader routes are:

```text
/works/[slug]/read
/works/[slug]/read/[chapter]
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

## Current materialization boundary

The retained ChatGPT File Library exposes validation metadata and extracted publication text, but not the raw L17 ZIP/Markdown/R2 bytes through this execution environment. The source therefore implements the complete activation and verification path without fabricating the missing bytes.

`L17B` is complete at the application/integration layer and remains blocked at the byte-materialization gate until the frozen package or its exact 57 files and three binary assets are available to the repository/release runtime.
