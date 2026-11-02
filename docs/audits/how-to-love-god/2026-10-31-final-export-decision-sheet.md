# How to Love God — final-export authority and hands-on acceptance

**Status: RELEASE NO_GO; no human approvals recorded.** Work ID `how-to-love-god`, catalog classification `ai-generated`, active release `1.1.0` and original release binaries remain unchanged. This worksheet defines the shortest remaining human and production decisions after the genuine unpublished `1.1.1-rc.1` machine PASS. It grants neither ownership nor permission to publish.

## 1. Decisions only the rights-holder/source-author can make

Record the reviewer’s identity/authority, a dated evidence identifier and an explicit signed decision for **every** item. An assistant cannot infer any of these from an existing cover or repository field.

| Decision | Exact question requiring an answer | Present status |
|---|---|---|
| Identity relationship | Are `Jonathan` on the 1.1.0 cover and `Thiepn` in `work.yaml` the same person, an authorized pen name, or different holders? Who has legal release authority? | **UNAPPROVED** |
| Public bibliographic byline | The user explicitly selected **Thiepn** for AI books on **2026-10-04**. Preserve that public-facing choice; determine how it is legally attributed to the rights-holder before applying it to copyright/exports. | **USER PREFERENCE RECORDED — legal/production authorization outstanding** |
| Ownership and copyright | Who owns the prose and the seven original media assets? What exact copyright notice and credit must be printed? Does this grant authorization for an updated edition? | **UNAPPROVED** |
| Reusing cover/figures | May the 1.1.0 cover and six figures be reused unchanged? If the old `Jonathan` cover conflicts with the approved byline, who approves its revision? | **UNAPPROVED** |
| Description approval | Are F01–F06 source-grounded long descriptions accepted individually, and which wording changes, if any, are required? | **UNAPPROVED** |
| Final version/release authority | Is a later version (e.g., `1.1.1`, **not yet selected**) approved for public Library release after full sign-off? | **UNAPPROVED** |

Preserve the user's previously explicit **Thiepn** AI-book byline preference; do **not** infer that Thiepn and Jonathan are the same legal person, or that a public author choice transfers copyright. The existing book is AI-authored and remains in the Library **AI** section; do not create another work record to change catalog placement.

## 2. Exact final-output metadata contract

The independent contract tests in `scripts/certification/how-to-love-god-final-export-contract.mjs` use **only artificial test names and hashes**. A synthetic positive test proves string escaping, PDF/EPUB field consistency, manifest schema and conditional refusal logic; it does **not** approve real identity, validate final PDF/EPUB binaries, or confirm R2 uploads.

For an eventual authorized export, select a single approved name/copyright source and map it consistently to: EPUB `dc:title`, `dc:creator`, `dc:language`, `dc:rights`; PDF Info `Title` and `Author`, PDF XMP title/creator/rights; printed cover and copyright page; Library `contributors` and `rights.notice`. Remove `UNPUBLISHED`, `QA`, draft disclaimers and provisional metadata from all final binaries. Any changes to those bytes **invalidate the current RC1 PDF/EPUB hashes**, requiring final-byte PDF/UA-1, EPUBCheck, content, link/media and reading-order requalification. Treat the temporary `1.1.1-rc.1` as evidence, never the public release.

A future approved `src/publications/releases/how-to-love-god/<version>.yaml` must satisfy the actual `src/lib/content/releases.ts` schema: `schemaVersion: 1`, unchanged `workId`, matching edition, approved `version`, actual `releasedAt` and source SHA-256, plus `pdf`, `epub`, `cover` entries with canonical URL, filename, MIME, byte size and SHA-256. A reused older cover URL requires documented reuse approval; do not invent a new cover object. `stage-publication-media.mjs` performs authenticated **remote R2 GET and hash verification**, not upload. Exact approved media must already exist in R2 before staging, and active-release promotion must be authorized as an atomic release change. A manifest preview is **not** a registered release.

## 3. Physical A5 readability: six exact figure checks

Use the **final exact-PDF SHA-256** and print at **148 × 210 mm, 100% actual size** (no automatic “fit to page”). Inspect the smallest labels, all arrows/relationships, captions and safety disclaimers. For each diagram, record paper/printer, date, reviewer, readable PASS/FAIL, unreadable label and proposed remediation. Existing unpublished proof placement is below; any repagination requires recalculation on the final export.

| Figure | Existing proof page | Required inspection | Decision |
|---|---:|---|---|
| F01 | 24 | Seven God-centered dimensions and radial labels | NOT_TESTED |
| F02 | 36 | Grace-before-response branching and fruit labels | NOT_TESTED |
| F03 | 53 | Christ/promise governing the three confirmation lenses | NOT_TESTED |
| F04 | 74 | Three-column practices/participation/growth flow | NOT_TESTED |
| F05 | 107 | Safety-first spiritual-distance discernment, all domain labels | NOT_TESTED |
| F06 | 157 | Seven overlapping church witness roles and directional text | NOT_TESTED |

Compare each proposed text with `scripts/certification/book1-figure-long-descriptions.proposed.json`; record `APPROVED`/`REVISE` **per figure**. All proposals are still marked `PROPOSED_NOT_APPROVED`. An enlarged insert or artwork modification requires explicit source-author consent and a new exact-byte export qualification.

## 4. EPUB and screen-reader acceptance (real human tests only)

Record **device OS, reading application and version, screen reader and version, test date, test-file SHA-256, named reviewer, observed result**, and screenshots/audio/logs if authorized.

- **EPUB desktop + Android:** Open real final EPUB in named readers. Confirm cover, 52 TOC/spine entries, all 51 sections, six `figure`/`figcaption` pairs, 40 internal note anchors, bidirectional navigation, large-font reflow and offline opening. Record individual failures.
- **PDF screen reader:** Inspect real final PDF headings/ordering/language, 29 corrected list structures, all 73 link descriptions (especially the 17 originally generated from destinations), 40 note links, cover and six diagram alternatives. Determine whether `/Em` and `/Strong` mapped to `/Span` loses required spoken emphasis; veraPDF machine PASS is insufficient.
- **EPUB assistive technology:** Read one diagram caption + its alternative, a multi-item list, a cross-reference, an endnote and return link. Check meaningful announced destinations and focus. Review all six long descriptions *after* explicit editorial approval.
- **Library app:** Only after authenticated full production build is possible, verify same existing book ID, Library AI discovery, web reader, bookmarks/notes, PDF/EPUB downloads, hash fidelity and desktop/Android navigation. Do not label an emulated test a physical-device test.

## 5. Immutable release and current hold

Prior passing CI: [RC1 machine formats](https://github.com/thiepn/library/actions/runs/41223682811), [read-only release contract](https://github.com/thiepn/library/actions/runs/41229683029). Keep `src/publications/releases/how-to-love-god/1.1.0.yaml` and `work.yaml` unchanged; keep draft PR #198 and Account draft PR #89. Private `@thiepn/account-session` dependency still fails frozen install with a private GitHub codeload 404; no repeat of unchanged private CI. No final metadata has been authorized, no current release registration or R2 upload is approved, and the release decision remains **NO_GO**.

## 6. Wired metadata staging, still strictly unpublished

A new, isolated **opt-in metadata stage** consumes the **existing real renderer outputs** (never a second book source): `scripts/certification/how-to-love-god-final-metadata-stage.mjs --prepare` reads the actual EPUB from `$RUNNER_TEMP/book1-format-qa/how-to-love-god-UNPUBLISHED-QA.epub` and the genuine PDF/UA repaired PDF from the same runner. The paired `scripts/certification/how-to-love-god-final-pdf-metadata.py` sets PDF Info Title/Author and XMP Dublin Core title/creator (ordered array)/rights, using the exact same normalized metadata as the EPUB OPF writer. All output filenames contain **FINAL-METADATA-REHEARSAL-QA** and remain isolated in the runner. No release-ready binaries are created and no files are uploaded to R2.

**Fail-closed requirement:** `BOOK1_FINAL_METADATA_REHEARSAL=1` and `BOOK1_FINAL_APPROVAL_RECORD` pointing to an externally supplied, uncommitted, dated approval JSON under the trusted temporary directory. Approval must explicitly cover public byline, copyright holder, rights notice, original cover reuse, all six figure permissions and *each approved description's SHA-256*, with a named reviewer and evidence reference. Before any rehearsal begins the metadata stage compares these approvals to actual `work.yaml`, the printed `00-copyright.md` and cover alternative text. **At present the current source is contradictory: Jonathan in copyright chapter versus Thiepn in work.yaml, therefore neither candidate identity can enter this stage without a separately approved and qualified source correction.** This is intentional, not a request to silently change the source.

**After external approvals and source alignment only:** regenerate the existing unpublished real proof by its already qualified pipeline, validate the original PDF/EPUB, run the opt-in metadata stage, then independently rerun **veraPDF PDF/UA-1, official EPUBCheck, media/text/link fidelity, real A5 and assistive-reader acceptance on the exact newly altered rehearsal bytes**. The previous RC1 binary hashes must never be reused as final-byte certification. Final release manifests and actual public files remain unimplemented and **NO_GO**.


## 7. Exact-source and media-binding requirements for any private rehearsal

The opt-in metadata stage must now receive an externally supplied, noncommitted approval record with `sourceContentSha256` for the **current 51-chapter manuscript** (computed using the same filename/length/content aggregate algorithm as RC1), plus `inputProofSha256.epub` and `inputProofSha256.pdf` for the **actual QA proof binaries**. The `cover.original110Sha256` and each of the six `figures[].original110Sha256` must match the immutable `1.1.0.yaml` media checksums. The stage also reads the previously verified seven-media manifest and rehashes the **actual seven source images** before modifying any EPUB/PDF metadata. A reused approval for different content or images must refuse.

A source-author decision must be made against the newly aligned, reviewed source *after* any copyright/byline corrections. Because the existing printed Jonathan copyright contradicts the user's already chosen Thiepn public-byline preference, rehearsal remains **blocked** pending rightful authorization to reconcile that discrepancy. A JSON statement of approval is a **custody record**, not independent cryptographic identity proof. Source changes require their own evidence and fresh exact-byte qualification; no existing 1.1.0 file may be overwritten.

