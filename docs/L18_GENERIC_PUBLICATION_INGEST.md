# L18 — Generic Publication Ingestion

Library publications now use a reusable ingest contract rather than book-specific deployment logic.

A publication ingest package contains:

- `publication.json` — immutable release/artifact metadata and hashes
- `work.yaml` — Library work metadata
- `chapters/*.md` — native-reader payload
- `recovery/publication-expected.json` — exact reader manifest
- `assets/*` — PDF, EPUB and cover bytes

The ingest workflow verifies the package and every declared artifact before writing to R2. It reads the uploaded R2 objects back, verifies their hashes again, writes the canonical release registry, runs the full Library certification suite, and promotes only the verified work source and registry to `main`.

Production deployment discovers every canonical release registry and stages all declared media from R2 into the GitHub Pages artifact. Adding a later book therefore does not require editing the deploy workflow.
