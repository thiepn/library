# Public-domain popularity policy

The autonomous public-domain importer is popularity-first.

1. Project Gutenberg's official **Top 100 EBooks — last 30 days** page is the authoritative acquisition ordering. The 30-day window is used to reduce one-day ranking noise.
2. The importer preserves the official rank exactly; literary/curation score may describe a candidate but must never move a lower-ranked ebook ahead of a higher-ranked ebook.
3. The ranking page must parse successfully with at least 80 unique ebook rows. If it is unavailable, timed out, malformed, or incomplete, a popularity run publishes **zero books** rather than substituting curated candidates.
4. The official Project Gutenberg machine-readable catalog supplies language, author, subject, and bookshelf metadata for ranked ebook IDs. Only English text candidates enter the current Library pipeline.
5. Germany-oriented fail-closed rights screening remains mandatory for authors, translators, editors, illustrators, and every other detected creative contributor.
6. Existing logical works are deduplicated across alternate Gutenberg editions, subtitles, and obvious translation/edition title variants; numbered parts remain distinct.
7. Every selected book records the official popularity source, 30-day window, rank, and download count in provenance.
8. Popularity ranking never weakens EPUB validation, immutable R2 upload/readback, complete Library certification, PR qualification, deployment qualification, or live source-identity verification.
