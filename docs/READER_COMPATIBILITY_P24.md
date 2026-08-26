# P24 — EPUB Styling Compatibility

## Status

P24 introduces the reader-side compatibility profile `thiepn-reader-epub-compat-1` for reflowable EPUB publications rendered by the staged EPUB.js reader.

This phase does not relax the P2 publication contract. Fixed-layout EPUBs, scripted-content dependencies, essential remote resources, broken publication structure, and other contract failures remain publication-ingest concerns rather than styling problems to repair at runtime.

## Governing rule

The reader may normalize presentation strongly enough to keep a reflowable book readable, responsive, themeable, and accessible, but it must not rewrite the publication's semantic document structure.

In particular, compatibility processing must not wrap, reorder, replace, or remove prose nodes. That protects EPUB CFIs used by:

- reading-position resume;
- progress;
- in-book search;
- bookmarks;
- highlights;
- notes.

The compatibility layer injects a stylesheet and data/custom-property state only. If malformed EPUB XHTML lacks a `head`, the stylesheet is appended at the end of `body` rather than inserting nodes before prose.

## Runtime architecture

```text
P23 staged reader
→ ReaderPublicationCompatibilityController
→ observe EPUB.js iframe lifecycle
→ applyReaderPublicationCompatibility(document, currentTheme)
→ thiepn-reader-epub-compat-1
```

The controller subscribes to the existing ReaderThemeController and reapplies the active palette to already-rendered spine documents without reopening or relocating the publication. New/replaced EPUB.js iframes are discovered through MutationObserver and load listeners.

Inspection failure is best-effort and non-fatal. The publication contract expects same-origin EPUB content, but a malformed/inaccessible iframe must not convert an otherwise readable publication into a fatal reader error.

## Compatibility matrix

### Nested fixed/minimum widths

Logical `min-inline-size` and `max-inline-size` constraints prevent common publisher wrappers, sections, lists, figures, and callouts from forcing the rendition wider than its available page/scroll viewport.

Logical properties are used intentionally so horizontal, RTL, and vertical writing systems are not converted into left-to-right physical-width assumptions.

### Reader theme authority

All six reader themes have an EPUB compatibility palette synchronized with the existing EPUB.js theme colors:

- Light
- Warm
- Sepia
- Gray
- Dark
- Black

The compatibility profile makes root text/background, links, borders, table headers, code surfaces, marks, and form controls reader-authoritative. Publisher backgrounds on ordinary prose containers are neutralized to transparent where necessary so dark/warm/sepia themes cannot become light-text-on-white or otherwise unreadable.

Publisher semantic structure, borders, emphasis, links, notes, list markers, headings, and media remain intact.

### Publisher font locks

Common prose and inline-emphasis descendants inherit the reader-selected typography with `!important` authority. Code/preformatted elements retain dedicated code treatment rather than being flattened into the prose font.

### Images and media

Images, pictures, video, canvas, SVG, iframe, object, and embed content receive bounded logical inline sizing. Raster/video/canvas media also receive viewport-aware block caps and `object-fit: contain` behavior.

No media element is removed and no figure is reparented.

### Tables

Tables and cells are bounded to the rendition width. Local horizontal overflow is allowed when a table cannot reflow further, while cell content receives emergency wrapping so one long token does not force whole-reader overflow.

P24 does not convert tables into non-table DOM structures.

### Code and long tokens

Preformatted blocks can wrap and scroll locally. URLs, code, keyboard text, and sample text receive emergency wrapping. This prevents long source lines or unbroken identifiers from defeating mobile, split-screen, or paginated layouts.

### Footnotes and endnotes

ARIA `doc-footnote` / `doc-endnote` and EPUB `epub:type` footnote/endnote structures receive bounded sizing and emergency wrapping without changing their roles or link relationships.

### Interactive EPUB content

Although scripted content remains disabled by contract, ordinary form controls that exist in EPUB XHTML receive theme-compatible foreground/background/border colors so they do not become unreadable under Dark/Black/Warm/Sepia themes.

## Explicit non-overrides

P24 intentionally does not globally override:

- `direction`;
- `writing-mode`;
- `text-orientation`;
- hidden/display semantics;
- publisher positioning wholesale;
- EPUB navigation structure;
- heading/list/table/note roles;
- DOM ordering.

This is necessary for multilingual, RTL, CJK, vertical-text, semantic-note, and assistive-technology correctness.

## Phase boundary

P24 solves reader-side presentation compatibility for publications that already satisfy the Library's EPUB contract.

It does not claim that every third-party EPUB is safe to ingest. P25 remains the existing-book migration phase, and later regression/browser/final-certification phases remain responsible for broader qualification.
