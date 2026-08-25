# Thiepn Library

Static-first personal publishing, reading, and learning platform for books, research editions, PDFs, EPUBs, annotations, search, and cross-work knowledge.

Production: `https://thiepn.dev/library`

## Architecture

The production runtime is:

- Astro 6 + strict TypeScript
- Archive Editorial CSS
- build-time publication metadata and Markdown/MDX content
- Pagefind static full-text search
- GitHub Pages mounted at `/library`
- Cloudflare R2 as the immutable source of publication binaries
- deployment-time R2 staging into the certified GitHub Pages artifact
- browser-local reading state; no account is required for the public Library
- optional owner-authenticated AI as a separate service, never as a dependency of the static reader

Large PDF, EPUB, and cover binaries do **not** live in normal Git history. Each canonical release records filename, MIME type, byte size, and SHA-256. Deployment downloads those objects from R2 and verifies them before they are included in the public Pages artifact.

## Local development

Requirements: Node.js 22.12+ and pnpm 11.21.0.

```bash
corepack enable
corepack prepare pnpm@11.21.0 --activate
pnpm install
pnpm dev
```

Astro serves the application under `/library` in development as well as production.

## Validation

```bash
pnpm validate
pnpm build
pnpm certify:source
pnpm release:certify
```

Production is fail-closed: source, reader manifests, release registries, built routes, and immutable media hashes must all pass before deployment.

## Content model

Canonical publication source belongs under:

```text
src/content/works/<work-id>/
├── work.yaml
├── chapters/
└── recovery/
```

Canonical binary release registries belong under:

```text
src/publications/releases/<work-id>/<version>.yaml
```

## Generic publication ingest

New publications use the L18 generic ingestion pipeline. An `ingest/**` request points to a frozen publication package containing:

```text
publication.json
work.yaml
chapters/
recovery/publication-expected.json
assets/
```

The ingest workflow:

1. verifies the package byte count and SHA-256;
2. validates publication identity and frozen reader-file hashes;
3. materializes the native reader source;
4. uploads publication artifacts to the provisioned R2 bucket;
5. downloads them again and verifies immutable size/SHA-256 readback;
6. writes the canonical release registry;
7. runs the complete Library certification suite;
8. promotes only verified publication source and registry data to `main`.

The normal production workflow then rebuilds the Library, stages every canonical R2 artifact generically, deploys through GitHub Pages, and verifies live routes and artifact hashes.

## Published works

### AI for the Kingdom

**Stewarding Artificial Intelligence for the Great Commission**

- native Web reader: 57 publication sections
- PDF: available
- EPUB: available
- frozen release: `1.0.0-rc4`

### How to Love God

**Understanding, Receiving, and Growing in Wholehearted Love for God**

- native Web reader: 57 publication sections
- PDF: available with redesigned publication cover
- EPUB: not supplied in the source edition
- active first-edition release: `1.0.1`
- `1.0.0` remains preserved as the previous immutable release

### The Unfinished Mission

**Why Gospel Access Remains Unequal—and What Faithful Mission Requires Now**

- native Web reader: 41 publication sections
- PDF: online Library edition available
- EPUB: available
- cover: canonical first-edition artwork
- first edition release candidate: `1.0.0-rc1`

The Library remains multi-work by design: catalog, work pages, native reader routes, search, publication media staging, and production verification all discover canonical works/releases rather than relying on per-book application code.
