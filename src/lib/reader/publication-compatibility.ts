export const READER_EPUB_COMPATIBILITY_PROFILE = 'thiepn-reader-epub-compat-1';
export const READER_EPUB_COMPATIBILITY_STYLE_ATTRIBUTE = 'data-reader-epub-compatibility';

export interface ReaderPublicationCompatibilityResult {
  profile: typeof READER_EPUB_COMPATIBILITY_PROFILE;
  applied: boolean;
  reused: boolean;
}

export const READER_EPUB_COMPATIBILITY_CSS = `
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] > :where(main, article, section, header, footer, nav, div),
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(article, section, aside, blockquote, figure, figcaption, ul, ol, dl) {
  min-inline-size: 0 !important;
  max-inline-size: 100% !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, caption) {
  max-inline-size: 100% !important;
  color: inherit !important;
  font-family: inherit !important;
  background-color: transparent !important;
  background-image: none !important;
  overflow-wrap: anywhere;
  word-break: normal;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(main, article, section, header, footer, nav, aside, div) {
  color: inherit !important;
  background-color: transparent !important;
  background-image: none !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption) :where(span, strong, em, b, i, u, s, small, cite, q) {
  color: inherit !important;
  font-family: inherit !important;
  background-color: transparent !important;
  background-image: none !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] li::marker {
  color: currentColor !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] figure,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] picture,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] img,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] video,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] canvas,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] svg,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] iframe,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] object,
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] embed {
  max-inline-size: 100% !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(img, video, canvas) {
  block-size: auto !important;
  max-block-size: 100vh !important;
  object-fit: contain;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] svg {
  max-block-size: 100vh !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] table {
  max-inline-size: 100% !important;
  overflow-x: auto !important;
  overflow-y: visible;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(th, td) {
  min-inline-size: 0 !important;
  max-inline-size: 100% !important;
  overflow-wrap: anywhere !important;
  word-break: normal;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] pre {
  max-inline-size: 100% !important;
  overflow: auto !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  tab-size: 4;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(a, code, kbd, samp) {
  max-inline-size: 100%;
  overflow-wrap: anywhere !important;
  word-break: normal;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where([role="doc-footnote"], [role="doc-endnote"], [epub\\:type~="footnote"], [epub\\:type~="endnote"]) {
  min-inline-size: 0 !important;
  max-inline-size: 100% !important;
  overflow-wrap: anywhere;
}

@media (max-width: 520px) {
  html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(table, pre, blockquote, figure) {
    max-inline-size: 100% !important;
  }
}
`;

export function applyReaderPublicationCompatibility(document: Document): ReaderPublicationCompatibilityResult {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) {
    return { profile: READER_EPUB_COMPATIBILITY_PROFILE, applied: false, reused: false };
  }

  root.setAttribute('data-reader-compatibility', READER_EPUB_COMPATIBILITY_PROFILE);
  body.setAttribute('data-reader-compatibility', READER_EPUB_COMPATIBILITY_PROFILE);

  const existing = document.querySelector<HTMLStyleElement>(`style[${READER_EPUB_COMPATIBILITY_STYLE_ATTRIBUTE}]`);
  if (existing) {
    if (existing.textContent !== READER_EPUB_COMPATIBILITY_CSS) existing.textContent = READER_EPUB_COMPATIBILITY_CSS;
    return { profile: READER_EPUB_COMPATIBILITY_PROFILE, applied: true, reused: true };
  }

  const style = document.createElement('style');
  style.setAttribute(READER_EPUB_COMPATIBILITY_STYLE_ATTRIBUTE, READER_EPUB_COMPATIBILITY_PROFILE);
  style.textContent = READER_EPUB_COMPATIBILITY_CSS;

  // EPUB XHTML should contain a head. For malformed-but-renderable content, appending
  // to the end of body avoids inserting/reparenting prose nodes and therefore avoids
  // destabilizing EPUB CFIs used by resume, bookmarks, search, highlights, and notes.
  const host = document.head ?? body;
  host.appendChild(style);

  return { profile: READER_EPUB_COMPATIBILITY_PROFILE, applied: true, reused: false };
}
