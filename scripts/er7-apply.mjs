import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`ER7 patch target missing: ${label}`);
  const second = source.indexOf(from, first + from.length);
  if (second >= 0) throw new Error(`ER7 patch target is not unique: ${label}`);
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

async function patchFile(path, replacements) {
  let source = await readFile(path, 'utf8');
  for (const [label, from, to] of replacements) source = replaceOnce(source, from, to, label);
  await writeFile(path, source);
}

await patchFile('src/layouts/EpubReaderLayout.astro', [
  [
    'EPUB ER7 CSS import',
    "import '../styles/reader-accessibility.css';",
    "import '../styles/reader-accessibility.css';\nimport '../styles/reader-device-ux.css';",
  ],
]);

await patchFile('src/layouts/PdfReaderLayout.astro', [
  [
    'PDF ER7 CSS import',
    "import '../styles/pdf-reader.css';",
    "import '../styles/pdf-reader.css';\nimport '../styles/reader-device-ux.css';",
  ],
]);

await patchFile('src/layouts/ReaderLayout.astro', [
  [
    'legacy ER7 CSS import',
    "import '../styles/reader.css';",
    "import '../styles/reader.css';\nimport '../styles/reader-device-ux.css';",
  ],
  [
    'legacy viewport-fit cover',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
  ],
]);

await patchFile('src/components/PdfReaderShell.astro', [
  [
    'PDF root panel state',
    '<main class="pdf-reader" data-pdf-reader-root aria-busy="true">',
    '<main class="pdf-reader" data-pdf-reader-root data-pdf-panel="closed" aria-busy="true">',
  ],
  [
    'PDF topbar ownership',
    '<header class="pdf-reader__topbar">',
    '<header class="pdf-reader__topbar" data-pdf-topbar>',
  ],
  [
    'PDF search disclosure semantics',
    '<button type="button" data-pdf-search-toggle aria-haspopup="dialog">Search</button>',
    '<button type="button" data-pdf-search-toggle aria-haspopup="dialog" aria-controls="pdf-search-panel" aria-expanded="false">Search</button>',
  ],
  [
    'PDF saved disclosure semantics',
    '<button type="button" data-pdf-bookmark-toggle aria-haspopup="dialog">Bookmarks</button>',
    '<button type="button" data-pdf-bookmark-toggle aria-haspopup="dialog" aria-controls="pdf-bookmarks-panel" aria-expanded="false">Saved</button>',
  ],
  [
    'PDF controlbar ownership',
    '<div class="pdf-reader__controlbar" aria-label="Page and zoom controls">',
    '<div class="pdf-reader__controlbar" data-pdf-controlbar aria-label="Page and zoom controls">',
  ],
  [
    'PDF dialog backdrop',
    '  </section>\n\n  <aside class="pdf-reader__panel" data-pdf-search-panel role="dialog" aria-labelledby="pdf-search-title" aria-hidden="true" hidden>',
    '  </section>\n\n  <button type="button" class="pdf-reader__backdrop" data-pdf-panel-backdrop tabindex="-1" aria-label="Close open PDF panel" aria-hidden="true" hidden></button>\n\n  <aside id="pdf-search-panel" class="pdf-reader__panel" data-pdf-search-panel role="dialog" aria-labelledby="pdf-search-title" aria-hidden="true" hidden>',
  ],
  [
    'PDF bookmark dialog id',
    '<aside class="pdf-reader__panel" data-pdf-bookmark-panel role="dialog" aria-labelledby="pdf-bookmarks-title" aria-hidden="true" hidden>',
    '<aside id="pdf-bookmarks-panel" class="pdf-reader__panel" data-pdf-bookmark-panel role="dialog" aria-labelledby="pdf-bookmarks-title" aria-hidden="true" hidden>',
  ],
]);

await patchFile('src/lib/pdf-reader/runtime.ts', [
  [
    'PDF device import',
    "import type { PdfCanonicalCandidate } from './canonical';",
    "import type { PdfCanonicalCandidate } from './canonical';\nimport { PdfDeviceController } from './device';",
  ],
  [
    'PDF owned device elements type',
    'type PdfReaderElements = {\n  viewport: HTMLElement;',
    'type PdfReaderElements = {\n  topbar: HTMLElement;\n  controlbar: HTMLElement;\n  backdrop: HTMLButtonElement;\n  viewport: HTMLElement;',
  ],
  [
    'PDF owned device elements collection',
    '  return {\n    viewport: required(root, \'[data-pdf-viewport]\'),',
    '  return {\n    topbar: required(root, \'[data-pdf-topbar]\'),\n    controlbar: required(root, \'[data-pdf-controlbar]\'),\n    backdrop: required(root, \'[data-pdf-panel-backdrop]\'),\n    viewport: required(root, \'[data-pdf-viewport]\'),',
  ],
  [
    'PDF focus trap helper',
    `function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}
`,
    `function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

const PANEL_FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapPanelFocus(panel: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const controls = [...panel.querySelectorAll<HTMLElement>(PANEL_FOCUSABLE)]
    .filter((control) => !control.hidden && control.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
`,
  ],
  [
    'PDF device controller field',
    `class PdfReaderController {
  private readonly root: HTMLElement;
  private readonly candidate: PdfCanonicalCandidate;
  private readonly elements: PdfReaderElements;
  private readonly abort = new AbortController();`,
    `class PdfReaderController {
  private readonly root: HTMLElement;
  private readonly candidate: PdfCanonicalCandidate;
  private readonly elements: PdfReaderElements;
  private readonly device: PdfDeviceController;
  private readonly abort = new AbortController();`,
  ],
  [
    'PDF device controller lifecycle start',
    `    this.candidate = candidate;
    this.elements = collectElements(root);
    this.bind();`,
    `    this.candidate = candidate;
    this.elements = collectElements(root);
    this.device = new PdfDeviceController(root);
    this.device.start();
    this.bind();`,
  ],
  [
    'PDF backdrop event',
    `    this.elements.searchToggle.addEventListener('click', () => this.openSearch(), { signal });
    this.elements.searchClose.addEventListener('click', () => this.closeSearch(), { signal });
    this.elements.searchSubmit.addEventListener('click', () => void this.search(this.elements.searchInput.value), { signal });`,
    `    this.elements.searchToggle.addEventListener('click', () => this.openSearch(), { signal });
    this.elements.searchClose.addEventListener('click', () => this.closeSearch(), { signal });
    this.elements.backdrop.addEventListener('click', () => this.closeActivePanel(), { signal });
    this.elements.searchSubmit.addEventListener('click', () => void this.search(this.elements.searchInput.value), { signal });`,
  ],
  [
    'PDF panel-aware keyboard navigation',
    `    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!this.elements.searchPanel.hidden) return this.closeSearch();
        if (!this.elements.bookmarkPanel.hidden) return this.closeBookmarks();
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        void this.goToPage(this.page - 1);
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        void this.goToPage(this.page + 1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        void this.changeZoom(ZOOM_STEP);
      } else if (event.key === '-') {
        event.preventDefault();
        void this.changeZoom(-ZOOM_STEP);
      }
    }, { signal });`,
    `    document.addEventListener('keydown', (event) => {
      const openPanel = !this.elements.searchPanel.hidden
        ? this.elements.searchPanel
        : !this.elements.bookmarkPanel.hidden
          ? this.elements.bookmarkPanel
          : null;
      if (openPanel) {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.closeActivePanel();
        } else {
          trapPanelFocus(openPanel, event);
        }
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        void this.goToPage(this.page - 1);
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        void this.goToPage(this.page + 1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        void this.changeZoom(ZOOM_STEP);
      } else if (event.key === '-') {
        event.preventDefault();
        void this.changeZoom(-ZOOM_STEP);
      }
    }, { signal });`,
  ],
  [
    'PDF dialog ownership methods',
    `  private openBookmarks() {
    this.closeSearch();
    this.elements.bookmarkPanel.hidden = false;
    this.elements.bookmarkPanel.setAttribute('aria-hidden', 'false');
    this.elements.bookmarkClose.focus();
  }

  private closeBookmarks() {
    if (this.elements.bookmarkPanel.hidden) return;
    this.elements.bookmarkPanel.hidden = true;
    this.elements.bookmarkPanel.setAttribute('aria-hidden', 'true');
    this.elements.bookmarkToggle.focus();
  }

  private openSearch() {
    this.closeBookmarks();
    this.elements.searchPanel.hidden = false;
    this.elements.searchPanel.setAttribute('aria-hidden', 'false');
    this.elements.searchInput.focus();
  }

  private closeSearch() {
    if (this.elements.searchPanel.hidden) return;
    this.elements.searchPanel.hidden = true;
    this.elements.searchPanel.setAttribute('aria-hidden', 'true');
    this.elements.searchToggle.focus();
  }
`,
    `  private setPanel(kind: 'search' | 'bookmarks' | null) {
    const panelOpen = kind !== null;
    this.elements.searchPanel.hidden = kind !== 'search';
    this.elements.searchPanel.setAttribute('aria-hidden', String(kind !== 'search'));
    this.elements.bookmarkPanel.hidden = kind !== 'bookmarks';
    this.elements.bookmarkPanel.setAttribute('aria-hidden', String(kind !== 'bookmarks'));
    this.elements.searchToggle.setAttribute('aria-expanded', String(kind === 'search'));
    this.elements.bookmarkToggle.setAttribute('aria-expanded', String(kind === 'bookmarks'));
    this.elements.backdrop.hidden = !panelOpen;
    this.elements.backdrop.setAttribute('aria-hidden', String(!panelOpen));
    this.elements.topbar.inert = panelOpen;
    this.elements.controlbar.inert = panelOpen;
    this.elements.viewport.inert = panelOpen;
    this.root.dataset.pdfPanel = kind ?? 'closed';
  }

  private openBookmarks() {
    this.setPanel('bookmarks');
    this.elements.bookmarkClose.focus();
  }

  private closeBookmarks() {
    if (this.elements.bookmarkPanel.hidden) return;
    this.setPanel(null);
    this.elements.bookmarkToggle.focus();
  }

  private openSearch() {
    this.setPanel('search');
    this.elements.searchInput.focus();
  }

  private closeSearch() {
    if (this.elements.searchPanel.hidden) return;
    this.setPanel(null);
    this.elements.searchToggle.focus();
  }

  private closeActivePanel() {
    if (!this.elements.searchPanel.hidden) this.closeSearch();
    else if (!this.elements.bookmarkPanel.hidden) this.closeBookmarks();
  }
`,
  ],
  [
    'PDF search result closes panel',
    `      button.addEventListener('click', () => {
        void this.goToPage(result.page);
      }, { signal: this.abort.signal });`,
    `      button.addEventListener('click', () => {
        this.closeSearch();
        void this.goToPage(result.page);
      }, { signal: this.abort.signal });`,
  ],
  [
    'PDF device controller teardown',
    `    this.destroyed = true;
    this.abort.abort();
    this.resizeObserver?.disconnect();`,
    `    this.destroyed = true;
    this.device.destroy();
    this.abort.abort();
    this.resizeObserver?.disconnect();`,
  ],
]);

await patchFile('src/lib/pdf-reader/index.ts', [
  [
    'PDF device API export',
    "export { mountPdfReader, type PdfReaderHandle } from './runtime';",
    "export { mountPdfReader, type PdfReaderHandle } from './runtime';\nexport {\n  PDF_DEVICE_DEFAULTS,\n  PdfDeviceController,\n  resolvePdfDeviceState,\n  type PdfDeviceMetrics,\n  type PdfDeviceOptions,\n  type PdfDeviceOrientation,\n  type PdfDeviceResolution,\n  type PdfDeviceState,\n} from './device';",
  ],
]);

await patchFile('package.json', [
  [
    'ER7 source certification chain',
    ' && node scripts/certification/reading-activity.mjs",',
    ' && node scripts/certification/reading-activity.mjs && node scripts/certification/reader-device-ux.mjs",',
  ],
]);

console.log('ER7 integration patch applied');
