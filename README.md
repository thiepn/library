# Thiepn Library

Static-first personal ebook library and reader for hosted and locally imported EPUB and PDF books.

Production: `https://thiepn.dev/library`

## Public product scope

The public product is a personal reading application, not a publishing dashboard. Readers can browse the catalog, save books, import their own local files, continue reading, switch between available formats, search inside books, bookmark pages or locations, annotate EPUB text, and reopen recent books without creating an account.

Publication validation, immutable media storage, and release ingestion remain maintenance infrastructure behind the reader. They are not the product’s public information architecture.

## Reader capabilities

- one consolidated EPUB reader for hosted and personal books
- one integrated PDF.js reader for hosted and personal books
- exact format-native resume positions: EPUB CFI, PDF page, and legacy web progress remain independent
- unified Start reading, Continue reading, Read again, Reading, Finished, and Saved for later states
- local EPUB search, bookmarks, highlights, and notes
- local PDF text search, page bookmarks, fit modes, zoom, and selectable text
- browser-local personal-book import with content-hash identity and duplicate detection
- bounded EPUB/PDF compatibility preflight before personal files are persisted
- explicit scanned/image-only PDF search and selection capability messaging
- responsive phone, tablet, split-window, desktop, safe-area, orientation, and software-keyboard handling
- installable PWA shell and exact active-release offline EPUB caching
- no reader account, telemetry, or personal-file upload requirement

## Architecture

The production runtime is:

- Astro 6 with strict TypeScript
- static catalog, book-detail, search, and reader routes
- Pagefind static full-text catalog/content search
- GitHub Pages mounted at `/library`
- Cloudflare R2 as immutable storage for hosted publication binaries
- deployment-time R2 staging into a hash-certified Pages artifact
- bundled `epubjs` and `pdfjs-dist` reader engines
- browser-local IndexedDB state for progress, activity, bookmarks, annotations, and personal books
- optional owner-authenticated AI as a separate service, never a dependency of the static reader

Large hosted PDF, EPUB, and cover binaries do not live in normal Git history. Each canonical release records filename, MIME type, byte size, and SHA-256. Deployment downloads those objects from R2, verifies them, and only then includes them in the public artifact.

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
pnpm test:reader
pnpm build
pnpm certify:source
pnpm release:certify
```

Cross-browser acceptance uses deterministic personal EPUB/PDF fixtures and the real browser reader routes:

```bash
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm build
pnpm test:e2e
```

The Playwright matrix covers Chromium, Firefox, and WebKit on desktop and phone-sized contexts. It is browser-engine evidence, not a substitute for named physical-device evidence.

### Publication compatibility corpus

RR3 defines deterministic supported, degraded, rejected, and bounded EPUB/PDF classes. Source ownership and the machine-readable corpus are checked with:

```bash
pnpm certify:compatibility
```

Run only the RR3 browser journeys with:

```bash
pnpm test:compatibility
```

The corpus includes EPUB 2/3, reflowable and fixed-layout books, navigation variants, rich resources, RTL/CJK/vertical writing, missing navigation, scripted-content attempts, malformed packages, traversal, archive-expansion attacks, remote resources, encrypted content, searchable and image-only PDFs, mixed/rotated/large pages, incremental updates, corrupt xrefs, active PDF content, and truncation. Rejected files fail before IndexedDB persistence; corrupt PDF cases must resolve to ready or an explicit bounded error.

### Physical-device evidence

RR2 stores manual evidence as exact-build JSON records. Structural validation confirms that the matrix and submitted records are honest and well-formed while allowing an incomplete physical campaign:

```bash
pnpm certify:physical:structure
```

The release gate is deliberately stricter. It passes only when all 12 required physical targets have current passing evidence for one exact build:

```bash
pnpm certify:physical:release -- --expected-sha <40-character-build-sha>
```

The checked-in template never counts as evidence. Current physical certification remains **0/12** until named devices are operated and records are committed.

Production is fail-closed for source, reader behavior, release registries, built routes, immutable media hashes, and the complete Chromium/Firefox/WebKit acceptance suite. The production workflow stages canonical media, runs browser acceptance, and only then uploads the GitHub Pages artifact. Physical Device Evidence remains a separate release signal; no automated run is represented as physical-device testing.

Release planning and support boundaries:

- `docs/RELEASE_READINESS_ROADMAP.md`
- `docs/RELEASE_SUPPORT_CONTRACT.md`
- `docs/RR2_PHYSICAL_DEVICE_ACCEPTANCE.md`
- `docs/RR3_PUBLICATION_COMPATIBILITY.md`
- `evidence/physical-devices/README.md`
- `docs/ER7_REAL_DEVICE_UX.md`

## Maintainer publication infrastructure

Canonical reader source belongs under:

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

New hosted books use the generic ingestion pipeline. A frozen package contains `publication.json`, `work.yaml`, native reader chapters, expected hashes, and release assets. The workflow verifies package identity, uploads artifacts to the provisioned R2 bucket, verifies immutable readback, writes the release registry, runs the complete Library certification suite, and promotes only verified source and registry data.

This pipeline exists to protect the reader from incomplete or mutable hosted releases; it is maintenance infrastructure rather than a reader-facing feature.

## Published library

### AI for the Kingdom

**Stewarding Artificial Intelligence for the Great Commission**

- native web compatibility edition: 57 publication sections
- EPUB reader edition: available
- integrated PDF edition: available
- frozen release: `1.0.0-rc4`

### How to Love God

**Understanding, Receiving, and Growing in Wholehearted Love for God**

- native web compatibility edition: 57 publication sections
- integrated PDF edition: available with redesigned cover
- EPUB: not supplied in the source edition
- active first-edition release: `1.0.1`
- `1.0.0` remains preserved as the previous immutable release

### The Unfinished Mission

**Why Gospel Access Remains Unequal—and What Faithful Mission Requires Now**

- native web compatibility edition: 41 publication sections
- EPUB reader edition: available
- integrated PDF edition: available
- first-edition release candidate: `1.0.0-rc1`

The catalog, book pages, readers, search, local activity state, media staging, production verification, and release evidence systems discover canonical works and releases generically. No current title requires a separate application implementation.
