import type { ReaderTheme } from './types';

export const READER_EPUB_COMPATIBILITY_PROFILE = 'thiepn-reader-epub-compat-1';
export const READER_EPUB_COMPATIBILITY_STYLE_ATTRIBUTE = 'data-reader-epub-compatibility';

interface ReaderCompatibilityPalette {
  background: string;
  text: string;
  secondary: string;
  link: string;
  rule: string;
  surface: string;
  code: string;
  mark: string;
}

export const READER_EPUB_COMPATIBILITY_PALETTES: Record<ReaderTheme, ReaderCompatibilityPalette> = {
  light: { background: '#fbfbfa', text: '#1d1e1c', secondary: '#555a55', link: '#315f86', rule: '#d7d9d5', surface: '#f1f2ef', code: '#f0f1ee', mark: '#fff1a8' },
  warm: { background: '#f7f3e8', text: '#28251f', secondary: '#625b50', link: '#6f552f', rule: '#d7cebd', surface: '#eee7d8', code: '#eee6d5', mark: '#eadc91' },
  sepia: { background: '#efe3ca', text: '#30271f', secondary: '#665545', link: '#75522f', rule: '#cdbb9d', surface: '#e6d5b6', code: '#e5d4b5', mark: '#ddc77f' },
  gray: { background: '#e7e8e8', text: '#26282a', secondary: '#5d6265', link: '#3d5f72', rule: '#c7cbcd', surface: '#daddde', code: '#d8dcdd', mark: '#d8cf83' },
  dark: { background: '#1c1d1e', text: '#e8e7e3', secondary: '#b9b8b2', link: '#9bc8e6', rule: '#454748', surface: '#292b2c', code: '#27292a', mark: '#655d2d' },
  black: { background: '#000000', text: '#efefed', secondary: '#b9b9b5', link: '#abd5ef', rule: '#353535', surface: '#111111', code: '#151515', mark: '#5f5728' },
};

export interface ReaderPublicationCompatibilityResult {
  profile: typeof READER_EPUB_COMPATIBILITY_PROFILE;
  theme: ReaderTheme;
  applied: boolean;
  reused: boolean;
}

export const READER_EPUB_COMPATIBILITY_CSS = `
html[data-reader-compatibility="thiepn-reader-epub-compat-1"],
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] {
  color: var(--reader-compat-text) !important;
  background: var(--reader-compat-bg) !important;
  background-color: var(--reader-compat-bg) !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] > :where(main, article, section, header, footer, nav, div),
html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(article, section, aside, blockquote, figure, figcaption, ul, ol, dl) {
  min-inline-size: 0 !important;
  max-inline-size: 100% !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(h1, h2, h3, h4, h5, h6, p, li, dt, dd, figcaption, caption) {
  max-inline-size: 100% !important;
  color: inherit !important;
  font-family: inherit !important;
  background-color: transparent !important;
  background-image: none !important;
  overflow-wrap: anywhere;
  word-break: normal;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(main, article, section, header, footer, nav, div) {
  color: inherit !important;
  background-color: transparent !important;
  background-image: none !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(blockquote, aside) {
  max-inline-size: 100% !important;
  color: var(--reader-compat-secondary) !important;
  border-color: var(--reader-compat-rule) !important;
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

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(a, a:visited) {
  color: var(--reader-compat-link) !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(hr, table, th, td) {
  border-color: var(--reader-compat-rule) !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] th {
  color: var(--reader-compat-text) !important;
  background: var(--reader-compat-surface) !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] td {
  color: inherit !important;
  background-color: transparent !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(pre, code, kbd, samp) {
  color: var(--reader-compat-text) !important;
  background: var(--reader-compat-code) !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] mark {
  color: var(--reader-compat-text) !important;
  background: var(--reader-compat-mark) !important;
}

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(button, input, textarea, select) {
  color: var(--reader-compat-text) !important;
  background: var(--reader-compat-surface) !important;
  border-color: var(--reader-compat-rule) !important;
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
  color-scheme: normal;
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

html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] ::selection {
  color: var(--reader-compat-text);
  background: var(--reader-compat-mark);
}

@media (max-width: 520px) {
  html[data-reader-compatibility="thiepn-reader-epub-compat-1"] body[data-reader-compatibility="thiepn-reader-epub-compat-1"] :where(table, pre, blockquote, figure) {
    max-inline-size: 100% !important;
  }
}
`;

function setCompatibilityPalette(root: HTMLElement, theme: ReaderTheme): void {
  const palette = READER_EPUB_COMPATIBILITY_PALETTES[theme];
  root.style.setProperty('--reader-compat-bg', palette.background);
  root.style.setProperty('--reader-compat-text', palette.text);
  root.style.setProperty('--reader-compat-secondary', palette.secondary);
  root.style.setProperty('--reader-compat-link', palette.link);
  root.style.setProperty('--reader-compat-rule', palette.rule);
  root.style.setProperty('--reader-compat-surface', palette.surface);
  root.style.setProperty('--reader-compat-code', palette.code);
  root.style.setProperty('--reader-compat-mark', palette.mark);
  root.style.setProperty('color-scheme', theme === 'dark' || theme === 'black' ? 'dark' : 'light', 'important');
}

export function applyReaderPublicationCompatibility(
  document: Document,
  theme: ReaderTheme = 'light',
): ReaderPublicationCompatibilityResult {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) {
    return { profile: READER_EPUB_COMPATIBILITY_PROFILE, theme, applied: false, reused: false };
  }

  root.setAttribute('data-reader-compatibility', READER_EPUB_COMPATIBILITY_PROFILE);
  body.setAttribute('data-reader-compatibility', READER_EPUB_COMPATIBILITY_PROFILE);
  root.setAttribute('data-reader-theme', theme);
  setCompatibilityPalette(root, theme);

  const existing = document.querySelector<HTMLStyleElement>(`style[${READER_EPUB_COMPATIBILITY_STYLE_ATTRIBUTE}]`);
  if (existing) {
    if (existing.textContent !== READER_EPUB_COMPATIBILITY_CSS) existing.textContent = READER_EPUB_COMPATIBILITY_CSS;
    return { profile: READER_EPUB_COMPATIBILITY_PROFILE, theme, applied: true, reused: true };
  }

  const style = document.createElement('style');
  style.setAttribute(READER_EPUB_COMPATIBILITY_STYLE_ATTRIBUTE, READER_EPUB_COMPATIBILITY_PROFILE);
  style.textContent = READER_EPUB_COMPATIBILITY_CSS;

  // EPUB XHTML should contain a head. For malformed-but-renderable content, appending
  // to the end of body avoids inserting/reparenting prose nodes and therefore avoids
  // destabilizing EPUB CFIs used by resume, bookmarks, search, highlights, and notes.
  const host = document.head ?? body;
  host.appendChild(style);

  return { profile: READER_EPUB_COMPATIBILITY_PROFILE, theme, applied: true, reused: false };
}
