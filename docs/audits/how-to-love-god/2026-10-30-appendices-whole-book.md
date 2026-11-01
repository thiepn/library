# How to Love God — Appendix and whole-book integrity audit

**Date:** October 30, 2026  
**Repository and draft PR:** `thiepn/library`, [#198](https://github.com/thiepn/library/pull/198)  
**Source-head reviewed:** `7ce353051ebfdec92d0c5066d1c4ad883e244cd8`  
**Original immutable release baseline:** `9dcf209e3ba10de203d7da34b435461dccef7862`  
**Decision:** **NO_GO** for new-edition release, merge, or deployment.

## Scope / what actually ran

- Read the full canonical contents of Appendices **A–L (12/12)** and the **3 front-matter, 7 part-opening, and 1 transition** source files. Previous evidence reports contain the complete targeted chapter reviews for all 28 numbered chapters (1–7, 8–14, 15–21, 22–28). Thus **51/51 sections have been read across successive audits**. This is neither independently reproduced full-text access to all cited copyrighted research nor confirmation of final production rendering.
- Run actual source-structure scans from exact GitHub blob contents: 12 appendix IDs/order keys unique, Appendix C numbered Days 1–30 present exactly once, Appendix L 20 unique source-note IDs with 20 matching back-links, and cross-check 20 exact note references/anchors in the nine relevant numbered chapters (7, 10, 11, 17, 19, 20, 24, 26, 27). All present, without duplicate calls/undefined anchors.
- Inventory Appendix L's **28 distinct external URLs (29 occurrences)**. Web retrieval sampled 26 URLs, of which some DOI publisher endpoints rejected or throttled automated requests (403/429/robots/redirect); a fetch denial **is not proof of a broken URL**. Representative live GRACE, Nazarene, Anglican, NIMH, WHO, Lausanne, OPC, SBC, Wood/Rünger, Barrett, Büssing and Lally pages resolved; some DOI identities separately verified through publishers/PubMed. A full human-network link certification of all 28 is **not** claimed.
- Compare `work.yaml`, `src/publications/releases/how-to-love-god/1.1.0.yaml` and `recovery/publication-expected.json` at parent HEAD. The active/version/release ID are consistently `1.1.0`; recovery manifest expects 51 reader sections; **all 9 artifact filename, byte-size and SHA-256 metadata fields match the release registry exactly** (PDF, EPUB, cover, figures 01–06). These are **registry-to-manifest metadata comparisons, not binary downloads or hash readback**.
- Exact source ancestry and unchanged original-release safety gates remain mandatory. The recovery document's historic `chapterWordsTotal: 40785` and `sourceHash` are **historical published edition snapshots**; after manuscript revisions, do not update these records or silently reissue the 1.1.0 release.

## Evidence-backed corrections made in the draft source

### HLG-STR-APP-C — Four required movements not actually written in each daily prompt

- **Severity:** Minor / usability and internal logic.
- **Original exact location:** `chapters/c-thirty-days-of-practicing-love-for-god.md:12`.
- **Evidence:** Introductory line says **each** day has explicit **Receive, Respond, Practice, Release**, while all 30 prompts are structured as short single Day entries and many do not specify all four (e.g. Day 8 is one command to obey, Day 15 a listening instruction, Day 29 an invitation to speak). All 30 day numbers exist, so missing exercises or fabricated days are **not** the issue.
- **Correction:** Frame four movements as an optional recurring approach and explicitly state that daily prompts are intentionally short; preserve all 30 prompts exactly. Does not impose spiritual-performance scoring.

### HLG-CONF-APP-J — Glossary definition inconsistent with corrected Chapter 27

- **Severity:** Minor / cross-chapter doctrinal precision.
- **Original exact location:** `chapters/j-glossary-and-disputed-terms.md:38`.
- **Evidence:** Chapter 27 now explicitly distinguishes the Church of the Nazarene's **entire sanctification as a work after regeneration**, cleansing from original sin, and subsequent character maturation, whereas the glossary's generic description as a present 'state of mature, wholehearted love' risks conflating these categories. See the official [Church of the Nazarene Articles of Faith](https://nazarene.org/resources/articles-of-faith/) and corrected `chapters/27-persevering-in-love-through-a-lifetime.md:60`.
- **Correction:** Define the specific confessional claim precisely, acknowledge that traditions differ, and keep it distinct from final eschatological perfection. No endorsement of one doctrine as universally accepted.

### HLG-ED-APP-K — Reading list regional scope misstated

- **Severity:** Minor / source scope and reader guidance.
- **Original exact location:** `chapters/k-recommended-resources.md:62`.
- **Evidence:** 'These resources are primarily North American' follows a reading list with substantial African and Asian authors in sections above, though the immediately preceding safeguarding materials are substantially U.S.-based. Broad label inaccurately describes the complete list.
- **Correction:** Scope the U.S.-based qualification to the safeguarding resources immediately above, acknowledge authors from multiple regions, retain local-law/jurisdiction warning.

### HLG-SRC-APP-L1 — Incorrect author names for scrupulosity review

- **Severity:** Major / inaccurate academic citation.
- **Original exact location:** `chapters/l-sources-notes-and-further-reading.md:211`, Evidence Bibliography.
- **Before:** `Miller, Colin H., and David W. Hedges.`
- **Verified correct:** `Miller, Chris H., and Dawson W. Hedges.`
- **Evidence:** [PubMed PMID 18226490](https://pubmed.ncbi.nlm.nih.gov/18226490/) and [Elsevier journal record](https://www.sciencedirect.com/science/article/pii/S0887618507002022), title *Scrupulosity disorder: an overview and introductory analysis*, Journal of Anxiety Disorders 22(6) (2008), 1042–1058; DOI `10.1016/j.janxdis.2007.11.004`.
- **Correction:** Only author names; DOI, year, volume, page numbers and paper title retained.

### HLG-SRC-APP-L2 — Omitted coauthors from spiritual-dryness citation

- **Severity:** Minor / scholarly attribution precision.
- **Original exact location:** `chapters/l-sources-notes-and-further-reading.md:203`.
- **Before:** `Büssing, Arndt.`
- **Verified correct coauthors:** `Büssing, Arndt, Lorethy Starck, and Klaus van Treeck.`
- **Evidence:** [PubMed PMID 33128707](https://pubmed.ncbi.nlm.nih.gov/33128707/) and [Springer article](https://doi.org/10.1007/s10943-020-01093-6); *Journal of Religion and Health* 60(2) (2021), 1281–1304.
- **Correction:** Restore actual coauthors; no change to the modest, population-limited empirical claim.

## Appendix-by-appendix outcome

| Appendix | Source lines at parent | Result |
|---|---:|---|
| A — Core Biblical Passages | 1–123 | Read; thematic passage descriptions and revised chapter claims sampled; unchanged. |
| B — Frequently Asked Questions | 1–73 | Read; assurance, sacraments, safety and missions consistent with revised chapters; unchanged. |
| C — Thirty Days of Practicing Love | 1–85 | Read; 30 numbered entries verified; **HLG-STR-APP-C corrected**. |
| D — Spiritual Dryness Discernment | 1–95 | Read; non-diagnostic wording, crisis help, medication and safeguarding boundaries; unchanged. |
| E — Contextual Rule of Life | 1–71 | Read; optional practices and limits preserved; unchanged. |
| F — Prayers | 1–55 | Read; described as original, non-Scripture prompts; unchanged. |
| G — Small-Group Discussion | 1–86 | Read; coercion, privacy and abuse safeguards retained; unchanged. |
| H — Assurance Without Scrupulosity | 1–45 | Read; bounded examination, referral and urgent help present; unchanged. |
| I — Pastoral Ministry Casebook | 1–53 | Read; seven cases are explicitly fictional and do not offer diagnosis; unchanged. |
| J — Glossary and Disputed Terms | 1–53 | Read; **HLG-CONF-APP-J corrected**. |
| K — Recommended Resources | 1–65 | Read; bibliography coverage and international scope checked; **HLG-ED-APP-K corrected**. |
| L — Sources/Notes/Bibliography | 1–280 | Read; 20 anchored source notes/backlinks checked, 28 distinct URLs inventoried; **two author-attribution corrections**. |

## Front matter, parts, transitions, full-book logic

- 3 front-matter files: `00-copyright.md`, `01-preface.md`, `02-introduction.md`; all read. Copyright © Jonathan is intentionally **not altered**.
- 7 part openings (I–VII) match the seven `work.yaml` part IDs. The single `6051-from-love-within-community-to-love-in-the-world.md` transition sits between Chapter 24 and Chapter 25 (order 6051), preserving the narrative sequence.
- Earlier chapter corrections to grace, assurance, John 3:5, baptism, safety, prayer, migration and entire sanctification are not contradicted by the revised appendix wording. Chapter references 1–28 and Appendix A–L identify existing parts of the manuscript; no broken note ID detected.
- Observed output uses raw `<sup class="endnote-call">` / `<span class="endnote-entry">` anchors: the exact source IDs are paired; **rendered EPUB/PDF/browser navigation remains unqualified**.
- Book is declared `authorship: ai-generated` with display author `Thiepn`; front matter and registered PDF/EPUB filenames identify `Jonathan`. Do not silently infer alias, transfer copyright, or modify historical release artifacts; this is an **editorial and legal attribution hold** pending explicit identity confirmation.
- The original work is marked `status: published`, `lastUpdated: 2026-08-28`, `activeRelease: 1.1.0`. Draft changes are **unreleased future-edition source**, not an update to live release metadata.

## Remaining gates / NO_GO

1. **Critical rights/attribution ambiguity** `HLG-AUT-001`: author's intended display identity and copyright claim need deliberate authorized reconciliation.
2. **Substantive scholarly verification:** sampled reputable sources substantiate bounded claims, but exhaustive full-text source-to-claim audit of every historical, theological and clinical reference is not complete; no blanket expert certification claimed.
3. **External URLs:** some DOI fetches were blocked by robots, rate limits and publisher redirects. Do not mark such links broken merely because automated retrieval failed. Unverified destinations and all rendered links require follow-up.
4. **Native CI:** previous exact-head Quality workflow fails before any source/build/browser gates when downloading `thiepn/account@83c3af63a18c771105e4460368dadbeaeb625fd0` without authorization. Only new genuine execution evidence can qualify the build; do not retry unchanged failure or change unrelated account dependencies speculatively.
5. **Immutable media:** original `1.0.0`, `1.0.1`, `1.1.0` binaries and releases remain untouched; no real PDF/EPUB image/readability/hash readback, no new-edition export, no merge/deploy.
6. **Human acceptance:** all substantive manuscript, doctrinal, legal, and publishing approvals remain outstanding.

**Next highest-value step:** remove verified infrastructure/auth bottleneck on the existing PR using a genuinely runnable, exact-head isolated source/reader acceptance route if possible; then complete binary and accessible reader verification, author attribution reconciliation, and explicitly approved versioned release planning.
