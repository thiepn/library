# 22R-P5B — External Gate Completion & Final `v1.0.0` Promotion

**Project:** *The Unfinished Mission: Why Gospel Access Remains Unequal—and What Faithful Mission Requires Now*  
**Date:** 23 August 2026  
**Candidate:** `v1.0.0-rc1`  
**Decision:** **HOLD — EXTERNAL RELEASE EVIDENCE IS INCOMPLETE; `v1.0.0` NOT PROMOTED**

## Executive decision

P5B was executed against the immutable `v1.0.0-rc1` lineage. The canonical files were recovered from the previously checksummed P5 release-hold ZIP rather than from separately surfaced duplicate PDFs, because the standalone copies had again diverged byte-for-byte from the frozen archive. The archive's own internal SHA-256 manifest was re-run successfully before any P5B validation.

The publication binaries remain technically stable, but the evidence required for a live KDP release is still absent. The supplied P4 Previewer & Physical Proof Log is completely unfilled: no KDP paperback ISBN, no Print Previewer result, no Kindle Online Previewer result, no physical-proof inspection, no official EPUBCheck result, no commercial-setting confirmation, and no final public-byline confirmation are recorded.

For that reason this phase cannot truthfully authorize publication or rename the candidate `v1.0.0`.

---

# P5B-A — Immutable release lineage

**PASS.**

The P5 release-hold archive was extracted and its internal manifest re-run. All manifest entries passed.

Canonical publication-file hashes:

| File | SHA-256 |
|---|---|
| Paperback interior | `35bf0176b6945edac1e65ec56c8c47d96d56f60bc544e7394264ae92db1c03fe` |
| Paperback cover | `f517fcb8734122c56c1f87fafe492db9f5c3610fdcd40eaf0e4b56de177813cd` |
| Kindle EPUB | `e37724f0cd74de6060c923b7514c64a0322a49c8bace22ffbdf2ff172d1d61c3` |
| Kindle cover | `08db849e640add47b9be543915117b0d74101af391487fdfe6e8efc41ec8e572` |

Operational rule: **only the P5B `CANONICAL` copies in this package are eligible for account upload.**

---

# P5B-B — Paperback/cover re-preflight

**PASS.**

Canonical paperback interior:

- 364 pages;
- 6 × 9 in / 432 × 648 pt;
- unencrypted;
- PDF 1.5;
- all six visible font families/subsets reported embedded and subset by `pdffonts`;
- same byte hash as the frozen P4 canonical interior.

Canonical full-wrap cover:

- one page;
- 947.52 × 666 pt = **13.160 × 9.250 in**;
- unencrypted;
- PDF 1.7;
- image-only flattened cover; no PDF font objects;
- same byte hash as the frozen P4 canonical cover.

No print binary was altered during P5B.

---

# P5B-C — EPUB structural validation

## Internal deep validator

**PASS — 26/26 checks; 0 errors; 0 warnings.**

P5B ran a new full structural pass over the exact canonical EPUB. It checked:

- `mimetype` position, content, and storage mode;
- duplicate and case-colliding ZIP members;
- `META-INF/container.xml`;
- OPF package parse and EPUB version;
- package unique identifier;
- Dublin Core title/language/creator;
- manifest integrity and resource existence;
- single navigation document;
- cover-image declaration;
- nonempty and resolvable spine;
- XHTML-only spine content;
- XML/XHTML well-formedness;
- duplicate element IDs;
- every internal resource link;
- every internal fragment target;
- EPUB navigation TOC;
- encryption/signature metadata.

Machine-readable output: `22R_P5B_DEEP_EPUB_STRUCTURAL_VALIDATION.json`.

## Official EPUBCheck 5.3.0

**OPEN.**

W3C/DAISY continues to identify EPUBCheck 5.3.0 as the latest production-ready official checker for EPUB 3.3. Java 21 is installed in the execution environment. Multiple retrieval paths for the official binary/distribution were attempted, but external binary transfer into this sandbox remains blocked. Therefore the internal structural PASS is **not** represented as an official EPUBCheck PASS.

Release criterion remains: official EPUBCheck 5.3.0 returns zero errors, with all warnings/usage messages reviewed.

---

# P5B-D — KDP account gates

**OPEN — no account-side evidence supplied and no KDP connector is available.**

The following evidence remains absent:

1. exact public author/byline confirmation;
2. KDP-assigned paperback ISBN;
3. KDP-detected 364 pages / 6 × 9 in;
4. Print Previewer successful processing;
5. complete list of Print Previewer warnings/errors;
6. Print Previewer approval;
7. Kindle EPUB conversion result;
8. Kindle Online Previewer checks for e-reader, phone, and tablet views;
9. KDP quality-panel review;
10. final paperback price;
11. final Kindle price and royalty option;
12. territories/right selection;
13. KDP Select decision;
14. completed KDP AI-generated-content disclosure.

The existing P4 account execution sheet remains the authoritative field-entry specification.

---

# P5B-E — Physical paperback proof

**OPEN — no manufactured proof exists in the supplied evidence.**

KDP's current workflow requires Print Previewer approval before a Draft paperback proof can be ordered. A physical proof must then be inspected for manufacturing, cover shift, spine centering, barcode placement, cream-paper readability, gutter comfort, footnote legibility, page sequence, and representative continuous reading.

No digital substitute can certify trim/binding/color/manufacturing behavior of an actual copy.

---

# P5B-F — Live-publication verification

**NOT STARTED / BLOCKED BY P5B-D AND P5B-E.**

No live Amazon paperback or Kindle listing can be claimed, and no ISBN/ASIN/store URLs are present in the evidence. Consequently there is nothing to verify for:

- live availability;
- metadata rendering;
- paperback/Kindle format linking;
- customer-facing price;
- Look Inside/sample behavior;
- ISBN/ASIN capture;
- marketplace propagation.

---

# P5B-G — Promotion rule

Promotion from `v1.0.0-rc1` to immutable `v1.0.0` is permitted only when **all** required external gates are evidenced as PASS and the four canonical publication-file hashes remain unchanged.

Current state:

| Gate | Status |
|---|---|
| Canonical release lineage | **PASS** |
| Paperback preflight | **PASS** |
| Full-wrap cover preflight | **PASS** |
| Deep EPUB structural validation | **PASS — 26/26, 0 errors/warnings** |
| Official EPUBCheck 5.3.0 | **OPEN** |
| Public byline lock | **OPEN** |
| KDP paperback ISBN | **OPEN** |
| KDP Print Previewer | **OPEN** |
| Kindle Online Previewer | **OPEN** |
| Physical paperback proof | **OPEN** |
| Final pricing/territories/Select | **OPEN** |
| KDP AI disclosure | **OPEN** |
| Paperback live | **BLOCKED** |
| Kindle live | **BLOCKED** |
| Live listing + format-link verification | **BLOCKED** |
| `v1.0.0` promotion | **BLOCKED** |

## Final P5B decision

**HOLD.**

The book is a technically frozen, promotion-ready **`v1.0.0-rc1`**, not a released `v1.0.0`.

No manuscript, interior, cover, or EPUB content change is warranted from the evidence currently available. The next legitimate work is purely external evidence completion. Once the filled KDP/physical-proof/EPUBCheck evidence is supplied, final promotion is deterministic: verify hashes, resolve any concrete defects, publish, record ISBN/ASIN/live URLs, verify format linking, write the final release manifest, and rename the immutable release `v1.0.0`.
