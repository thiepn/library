# RR3 — EPUB and PDF Compatibility Corpus

## Purpose

RR3 turns publication-format compatibility into an executable, bounded contract. It does not claim that every historical EPUB/PDF variant is supported. It defines which classes open normally, which open with explicit limitations, which are rejected before persistence, and which malformed PDF structures may resolve only to either a usable reader or a bounded error.

The authoritative corpus manifest is `tests/compatibility/corpus.json`. Deterministic fixture bytes are generated in `tests/e2e/compatibility-fixtures.ts`; no private books, third-party copyrighted files, or network-hosted fixtures are required.

## Evidence categories

- **Preflight classification:** browser-safe structural inspection before a personal file is hashed or stored.
- **Browser-runtime evidence:** Playwright imports and operates the real personal EPUB/PDF routes in Chromium, Firefox, and WebKit.
- **Production-gate evidence:** the full browser suite runs after immutable publication media staging and before the GitHub Pages artifact is uploaded.
- **Physical-device evidence:** remains separate under RR2 and is not inferred from this corpus.

## Supported and degraded EPUB classes

| Class | Expected result | Contract |
| --- | --- | --- |
| EPUB 3 reflowable | Pass | Package, manifest, spine, EPUB 3 navigation, nested TOC, landmarks, page list, notes, internal/external links, SVG, raster image, table, code, MathML, media fallback, embedded-font declaration, and publisher CSS are inspected and the canonical reader reaches ready state. |
| EPUB 2 with NCX | Pass | EPUB 2 package/spine and NCX navigation open through the same canonical reader. |
| RTL/CJK/vertical writing | Pass | Direction and writing-mode metadata are detected; content opens without being reclassified as ordinary LTR. |
| Fixed-layout EPUB | Degraded | Publisher geometry is preserved where EPUB.js supports it. Typography, width, margins, pagination, and selection may not behave like a reflowable book. The limitation is recorded rather than hidden. |
| Missing navigation | Degraded | A valid spine may still open, but contents/navigation tools can be limited. |
| Scripted EPUB | Degraded | Publication JavaScript remains disabled. The book may open as static content; scripts may not execute in the reading frame. |
| IDPF/Adobe font obfuscation | Supported in principle | The preflight permits recognized font-obfuscation algorithms. Other encryption/DRM algorithms are rejected. |

External hyperlinks are allowed as user-initiated links. Automatic remote publication resources are not allowed.

## Rejected EPUB classes

The import fails before hashing or IndexedDB persistence when any of these boundaries is violated:

- invalid or missing ZIP directory;
- multipart/ZIP64 archive outside the bounded import contract;
- more than 10,000 archive entries;
- any expanded entry above 128 MB;
- total declared expanded size above 512 MB;
- compression ratio above 500:1;
- encrypted ZIP entries;
- unsupported ZIP compression methods;
- absolute paths, drive paths, backslashes, `.`/`..` traversal segments, or duplicate entry names;
- invalid `mimetype`, missing `META-INF/container.xml`, missing package document, empty/invalid spine, or missing required manifest/spine resources;
- unsupported DRM/content encryption;
- manifest or document attempts to load automatic HTTP(S) resources.

Each rejection has a stable machine-readable code and a user-facing message. Rejected files are not added to My Library.

## PDF classes

| Class | Expected result | Contract |
| --- | --- | --- |
| Searchable text PDF | Pass | PDF.js opens the document, text layer is available, search/selection capability is reported, and page navigation/resume remain canonical. |
| Mixed page sizes and rotation | Pass | Fit modes and bounded zoom use each page’s actual viewport. |
| Large page | Pass | Fit calculation keeps the rendered canvas within the reader viewport rather than allocating a full-resolution page-sized surface. |
| Image-only/scanned PDF | Pass with capability limitation | The page remains readable as pixels. The text layer is labelled unavailable and the search panel states that the PDF has no searchable text when every page has been observed without text. |
| Standard fonts, form/link dictionaries | Read-only pass | The document opens and these structures are classified. Interactive form filling and a full annotation/link layer are not certified in RR3. |
| Incremental update | Bounded | The reader must reach ready or an explicit error within 30 seconds. |
| Corrupt xref | Bounded | PDF.js recovery may succeed; otherwise the reader must show an explicit bounded error. Endless loading is a failure. |
| Password/encrypted PDF | Reject | Encrypted/password-protected PDFs are outside the current integrated-reader contract. |
| Active PDF content | Reject | JavaScript, launch actions, and rich-media actions are blocked before persistence. |
| Truncated/missing EOF | Reject | Incomplete PDF bytes are rejected before persistence. |

## Security and resource boundaries

### EPUB archive limits

```text
compressed personal file: 250 MB maximum
archive entries:          10,000 maximum
expanded single entry:    128 MB maximum
total expanded size:      512 MB maximum
compression ratio:        500:1 maximum
inspection text entry:    8 MB maximum
```

The central directory is inspected before any entry is inflated. Entries are decompressed only after declared sizes, compression method, path, encryption flags, duplicates, total expansion, and ratio have passed. Actual decompressed bytes must match the declared size.

### Content execution and network behavior

- EPUB.js remains configured with scripted content disabled.
- Scripted fixtures must open without changing the parent page or executing publication code.
- Automatic HTTP(S) resources in EPUB manifest/content/CSS are rejected before the reader mounts.
- PDF.js remains configured with evaluation disabled.
- PDF JavaScript, launch actions, and rich-media actions are rejected.
- External anchor links are not confused with automatic publication resource loads.

### Lifecycle

The existing EPUB and PDF runtimes retain their cancellation and destruction owners. RR3 verifies that malformed/corrupt fixtures resolve to either ready or explicit error within the corpus timeout. Later performance work may tighten memory/time budgets, but an unbounded spinner is already a release failure.

## Corpus execution

Run the source contract:

```bash
pnpm certify:compatibility
```

Run only RR3 browser journeys:

```bash
pnpm test:compatibility
```

Run the complete release browser suite:

```bash
pnpm test:e2e
```

The dedicated `Publication Compatibility` workflow runs the RR3 corpus in Chromium, Firefox, and WebKit and retains traces, screenshots, video, and the Playwright report only on failure. The production deployment workflow runs the complete browser suite after staging canonical media and before uploading the Pages artifact.

## Defect policy

- **P0:** data loss, security-boundary escape, publication code execution, hostile network request, unbounded archive expansion, or widespread reader crash.
- **P1:** supported fixture cannot import/open/navigate, rejected fixture persists, image-only capability is misrepresented, or corrupt input hangs.
- **P2:** degraded fixture has an inaccurate limitation or important workaround.
- **P3:** cosmetic corpus/reporting issue.

A new fixture is required for every confirmed publication-class regression before the fix is considered permanent.

## Exit criteria

RR3 is complete when:

- the manifest contains unique deterministic EPUB/PDF fixtures for the documented classes;
- supported fixtures pass their expected browser journeys in Chromium, Firefox, and WebKit;
- fixed-layout, missing-navigation, scripted, and other degraded classes expose their limitations honestly;
- traversal, archive-expansion, remote-resource, DRM/encryption, active-content, and truncated fixtures are rejected before persistence with stable codes;
- image-only PDF search and selection limitations are explicit;
- corrupt-xref and incremental PDFs reach ready or bounded error within 30 seconds;
- no fixture triggers a publication script, remote resource request, silent hang, or unbounded operation;
- Quality, Browser Acceptance, Publication Compatibility, and the production browser gate pass.

## Current status

The RR3 implementation supplies the corpus, generator, bounded preflight, import/runtime integration, browser journeys, dedicated workflow, source certification, and documentation. RR2 physical-device evidence remains a separate unfinished campaign and is not advanced by RR3 automation.
