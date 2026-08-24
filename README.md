# Thiepn Library

Static-first personal publishing, reading, and learning platform for books, courses, research editions, PDFs, EPUBs, annotations, and cross-work knowledge.

## Architecture

The canonical runtime is:

- Astro 6 + strict TypeScript
- native Archive Editorial CSS
- build-time publication metadata and Markdown/MDX content
- Pagefind for static full-text search
- Cloudflare Workers Static Assets mounted only at `/library`
- Cloudflare R2 for immutable PDF/EPUB publication binaries
- browser-local reading state; no account is required for the public library
- optional owner-authenticated AI as a separate Worker, never as a dependency of the static library

Production application: `https://thiepn.dev/library`

Publication media: `https://media.library.thiepn.dev`

The main `thiepn.dev` site remains the origin for every path outside `/library`; the Library Worker is configured as a Cloudflare path route, not as a standalone custom domain.

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
```

A production deployment is deliberately fail-closed. `pnpm deploy` first runs the full release certification, and the GitHub deploy workflow remains skipped until the immutable release registry and Cloudflare credentials are present.

## Content

Canonical publication source belongs under:

```text
src/content/works/<work-id>/
├── work.yaml
└── chapters/
```

Large immutable public binaries do **not** belong in Git. Release records point to the R2 publication domain.

## Current release gate

The application shell, `/library` path deployment architecture, native reader, search, saved state, annotations surface, security headers, sitemap, release verifier, R2 verification pipeline, frozen dependency lockfile, and production deployment workflow are implemented.

The exact frozen `AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip` has now been recovered and verified at 2,034,059 bytes with SHA-256 `1c6f831ca9c3a48031121dc6129d39cb66f5ad521d53c3e9f40153f8c9f776b7`. Its complete 57-file native reader payload was merged into `main` after source certification and a full production build passed in PR #6.

The only remaining hard publication gate is Cloudflare release activation. GitHub Actions currently does not have `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, so the PDF, EPUB, and cover cannot yet be uploaded to R2, read back, hash-verified, and promoted into the canonical live release registry.

Until that R2 verification succeeds, binary download controls remain fail-closed rather than exposing an unverifiable publication.

See `docs/RECOVERY_STATUS.md` and `docs/L17B_PUBLICATION_MATERIALIZATION.md`.
