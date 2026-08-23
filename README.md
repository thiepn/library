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

Formal release certification additionally requires a committed `pnpm-lock.yaml`, the complete publication payload, a dependency-connected build, and production/runtime evidence. The recovery tree deliberately does not manufacture those results.

## Content

Canonical publication source belongs under:

```text
src/content/works/<work-id>/
├── work.yaml
└── chapters/
```

Large immutable public binaries do **not** belong in Git. Release records point to the R2 publication domain.

## Recovery status

The repository was originally bootstrapped without the cumulative L0–L16 source. The current tree restores the canonical Astro architecture and Archive Editorial runtime surface. The validated L17 metadata for **AI for the Kingdom** is registered, but its 57 native reader files and immutable PDF/EPUB/cover bytes have not been materialized into this repository/runtime yet, so reader/download controls remain intentionally unavailable instead of failing at runtime.

See `docs/RECOVERY_STATUS.md`.
