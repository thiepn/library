# Public Domain Autopilot

The Public Domain Autopilot is the Library's unattended acquisition pipeline for popular public-domain ebooks.

## Schedule

- Runs weekly through GitHub Actions.
- Default batch: 10 new books.
- Manual `workflow_dispatch` remains available for maintenance or a deliberate one-off batch.
- An authorized Library Autopilot Supervisor handles verified promotion branches, CI, merge recovery, deployment verification, and failed-run repair without requiring routine user action.

## Selection

1. Read Project Gutenberg's own **Top 100 EBooks last 7 days** ranking from `https://www.gutenberg.org/browse/scores/top`.
2. Use the published seven-day download count as the primary and authoritative acquisition order.
3. If the official ranking is temporarily unavailable, Gutendex's live download ranking may be used as a secondary source.
4. If neither live popularity source can be established reliably, add **zero books**. Editorial shelf scores are never allowed to masquerade as popularity.
5. Verify the selected Project Gutenberg edition is English from the official RDF before publication.
6. Skip Gutenberg IDs already present and also suppress alternate editions/translations of a logical work already represented in the Library.
7. Reject catalogs, indexes, magazines, directories, and similar low-value records where applicable.

This policy deliberately prefers a no-op over publishing a batch that cannot truthfully be described as the most popular currently eligible books.

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
- Normalize obvious translation/edition qualifiers for duplicate detection so a second translation of the same logical work cannot consume another catalog slot.

## Publication pipeline

For every accepted title:

1. Generate a Library `work.yaml` manifest and immutable release registry.
2. Generate provenance and rights ledger data, including the live download count and ranking source used at selection time.
3. Run the complete `pnpm release:certify` suite.
4. Upload the EPUB to the existing Cloudflare R2 publication bucket.
5. Read it back and verify byte length and SHA-256.
6. Only after all previous gates pass, commit the catalog metadata to an `autopilot/public-domain-*` promotion branch.
7. The authorized Library Autopilot Supervisor creates the promotion PR, waits for the repository's pull-request acceptance suites, repairs failures when safe, and merges only a verified, mergeable result.
8. A merged batch is not considered published until the resulting `main` SHA passes the complete production deployment gate and live source-identity verification on `thiepn.dev/library`.

GitHub Actions itself is intentionally not required to create or approve pull requests, so repository-level Actions permission settings do not create a manual dependency.

The autopilot never promotes a candidate whose popularity source, rights gate, EPUB validation, Library certification, R2 upload, readback verification, PR qualification, or production verification fails.

## Provenance

`src/publications/public-domain-ledger.json` records the Gutenberg ID, source URLs, source hashes, selection score, download count at selection, ranking mode, rights cutoff, detected contributors, and release version for every automatically selected title.
