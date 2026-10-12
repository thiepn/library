# Public Domain Autopilot

The Public Domain Autopilot is the Library's unattended acquisition pipeline for high-value public-domain ebooks.

## Schedule

- Recurring acquisition was deliberately stopped on 2026-10-12 after the owner selected a final 29-book essential canon.
- The weekly GitHub Actions schedule is disabled; only explicitly authorized manual maintenance or one-time curated acquisition is allowed.
- The existing official-popularity pipeline remains available for troubleshooting but must not resume recurring or bulk imports.
- Durable discovery starts from Project Gutenberg's official machine-readable catalog.
- Up to two Gutendex popularity pages are optional ranking enrichment only.
- Manual `workflow_dispatch` remains available for explicitly approved maintenance only; it must not be used to resume bulk or periodic acquisition.
- The former hourly Library Autopilot Supervisor is disabled; no recurring automatic promotion is authorized.


## Final essential-canon freeze (2026-10-12)

- Final essential shortlist: 29 works. Exactly 13 Gutenberg editions passed qualification; 16 are recorded as missing from the curated import (15 source-edition mismatches/unavailable records, 1 unsafe illustrated edition).
- Certified curated acquisition: GitHub Actions [run 38214900974](https://github.com/thiepn/library/actions/runs/38214900974), finalize job 114697811463.
- The immutable R2 release pipeline verified the byte length and SHA-256 readback of all 13 new EPUBs before pushing publication metadata to main.
- Final curated publication commit: `a9c8daba65106e97f0f3547c2bd0c6b8e448fb6a`. That snapshot contains 149 public-domain Gutenberg works and 5 native works (154 total).
- The curated audit in `src/publications/curated-canon-status.json` records 13 represented and 16 missing titles, which remain missing rather than silently substituted.
- The curator's GitHub Actions credential pushed the final commit; the normal push-triggered Pages deployment may not run for such bot-generated commits. A subsequent authorized documentation-only release marker is used to initiate the normal `Deploy Library` source build and complete live-production verification.
- No recurring bulk additions are authorized. Leave source licensing, prior published records, notes, data, and Account permissions unchanged.

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
