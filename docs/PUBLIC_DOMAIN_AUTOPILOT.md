# Public Domain Autopilot

The Public Domain Autopilot is the Library's unattended acquisition pipeline for high-value public-domain ebooks.

## Schedule

- Runs weekly through GitHub Actions.
- Default batch: 10 new books.
- Durable discovery starts from Project Gutenberg's official machine-readable catalog.
- Up to two Gutendex popularity pages are optional ranking enrichment only.
- Manual `workflow_dispatch` remains available for maintenance or a larger one-off batch.
- An authorized hourly Library Autopilot Supervisor handles verified promotion branches, CI, merge recovery, and failed-run repair without requiring routine user action.

## Selection

1. Discover English-language Project Gutenberg texts from the official catalog.
2. Rank candidates using curated shelves such as Best Books Ever Listings, Harvard Classics, and Classics of Literature, plus current popularity when optional popularity data is available.
3. Reject catalogs, indexes, magazines, directories, and similar low-value records.
4. Skip books already published by the autopilot.
5. Keep the official Gutenberg catalog operationally authoritative: an outage in optional ranking enrichment cannot stop ingestion.

## Rights gate

The publication gate is intentionally fail-closed.

- Jurisdiction baseline: Germany.
- Ordinary copyright term: 70 years after death, calculated to the end of the calendar year.
- The cutoff is recalculated every calendar year.
- Official Project Gutenberg RDF metadata is inspected for the creator and detected creative contributors such as translators, illustrators, editors, annotators, and adapters.
- Every detected creative contributor must have a known death year at or before the current cutoff.
- A Project Gutenberg/Gutendex copyright flag blocks autonomous publication.
- Unknown or ambiguous rights data causes a skip, never a publish.
- Rejected candidates are cached for the current cutoff year and are reconsidered after the cutoff advances.

This is a conservative automation policy, not a substitute for a legal opinion. It is designed to prefer false negatives over publishing a legally uncertain edition.

## Edition policy

- Prefer Project Gutenberg's text-only EPUB to minimize independent illustration rights.
- Preserve the source EPUB rather than rewriting the text.
- Validate the EPUB container before publication.
- Keep Project Gutenberg's embedded notices intact.
- Generate a local THIEPN Library cover rather than reusing external cover art.
- Use creator-only display bylines while preserving translators and other contributors with their exact roles in provenance and work metadata.
- Normalize multiline source titles for clean Library browsing without altering the source EPUB.

## Publication pipeline

For every accepted title:

1. Generate a Library `work.yaml` manifest and immutable release registry.
2. Generate provenance and rights ledger data.
3. Run the complete `pnpm release:certify` suite.
4. Upload the EPUB to the existing Cloudflare R2 publication bucket.
5. Read it back and verify byte length and SHA-256.
6. Only after all previous gates pass, commit the catalog metadata to an `autopilot/public-domain-*` promotion branch.
7. The authorized Library Autopilot Supervisor creates the promotion PR, waits for the repository's pull-request acceptance suites, repairs failures when safe, and squash-merges only a verified, mergeable result.

GitHub Actions itself is intentionally not required to create or approve pull requests, so repository-level Actions permission settings do not create a manual dependency.

The autopilot never promotes a candidate whose rights gate, EPUB validation, Library certification, R2 upload, or readback verification fails.

## Provenance

`src/publications/public-domain-ledger.json` records the Gutenberg ID, source URLs, source hashes, selection score, download count at selection, rights cutoff, detected contributors, and release version for every automatically selected title.
