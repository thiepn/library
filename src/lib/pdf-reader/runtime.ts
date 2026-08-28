import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfCanonicalCandidate } from './canonical';
import { PdfDeviceController } from './device';
import {
  getPdfBookmarks,
  getPdfProgress,
  getPdfReaderSettings,
  setPdfProgress,
  setPdfReaderSettings,
  togglePdfBookmark,
  type PdfBookmarkRecord,
  type PdfFitMode,
  type PdfReaderSettings,
} from './state';

GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;
const MAX_SEARCH_RESULTS = 250;

export interface PdfReaderHandle {
  destroy(): Promise<void>;
  retry(): Promise<void>;
}

type SearchResult = { page: number; snippet: string };

type PdfReaderElements = {
  topbar: HTMLElement;
  controlbar: HTMLElement;
  backdrop: HTMLButtonElement;
  viewport: HTMLElement;
  canvas: HTMLCanvasElement;
  textLayer: HTMLElement;
  status: HTMLElement;
  error: HTMLElement;
  errorMessage: HTMLElement;
  retry: HTMLButtonElement;
  pageInput: HTMLInputElement;
  pageCount: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  fit: HTMLSelectElement;
  zoomLabel: HTMLElement;
  progress: HTMLElement;
  bookmark: HTMLButtonElement;
  bookmarkPanel: HTMLElement;
  bookmarkList: HTMLElement;
  bookmarkClose: HTMLButtonElement;
  searchPanel: HTMLElement;
  searchInput: HTMLInputElement;
  searchSubmit: HTMLButtonElement;
  searchClose: HTMLButtonElement;
  searchStatus: HTMLElement;
  searchResults: HTMLElement;
  searchToggle: HTMLButtonElement;
  bookmarkToggle: HTMLButtonElement;
};

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`PDF reader shell is missing ${selector}.`);
  return element;
}

function collectElements(root: HTMLElement): PdfReaderElements {
  return {
    topbar: required(root, '[data-pdf-topbar]'),
    controlbar: required(root, '[data-pdf-controlbar]'),
    backdrop: required(root, '[data-pdf-panel-backdrop]'),
    viewport: required(root, '[data-pdf-viewport]'),
    canvas: required(root, '[data-pdf-canvas]'),
    textLayer: required(root, '[data-pdf-text-layer]'),
    status: required(root, '[data-pdf-status]'),
    error: required(root, '[data-pdf-error]'),
    errorMessage: required(root, '[data-pdf-error-message]'),
    retry: required(root, '[data-pdf-retry]'),
    pageInput: required(root, '[data-pdf-page-input]'),
    pageCount: required(root, '[data-pdf-page-count]'),
    previous: required(root, '[data-pdf-previous]'),
    next: required(root, '[data-pdf-next]'),
    zoomOut: required(root, '[data-pdf-zoom-out]'),
    zoomIn: required(root, '[data-pdf-zoom-in]'),
    fit: required(root, '[data-pdf-fit]'),
    zoomLabel: required(root, '[data-pdf-zoom-label]'),
    progress: required(root, '[data-pdf-progress]'),
    bookmark: required(root, '[data-pdf-bookmark]'),
    bookmarkPanel: required(root, '[data-pdf-bookmark-panel]'),
    bookmarkList: required(root, '[data-pdf-bookmark-list]'),
    bookmarkClose: required(root, '[data-pdf-bookmark-close]'),
    searchPanel: required(root, '[data-pdf-search-panel]'),
    searchInput: required(root, '[data-pdf-search-input]'),
    searchSubmit: required(root, '[data-pdf-search-submit]'),
    searchClose: required(root, '[data-pdf-search-close]'),
    searchStatus: required(root, '[data-pdf-search-status]'),
    searchResults: required(root, '[data-pdf-search-results]'),
    searchToggle: required(root, '[data-pdf-search-toggle]'),
    bookmarkToggle: required(root, '[data-pdf-bookmark-toggle]'),
  };
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function isTypingTarget(target: EventTarget | null): boolean {
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

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The PDF could not be opened in the integrated reader.';
}

function isRenderingCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}

class PdfReaderController {
  private readonly root: HTMLElement;
  private readonly candidate: PdfCanonicalCandidate;
  private readonly elements: PdfReaderElements;
  private readonly device: PdfDeviceController;
  private readonly abort = new AbortController();
  private loadingTask?: PDFDocumentLoadingTask;
  private document?: PDFDocumentProxy;
  private renderTask?: RenderTask;
  private textLayer?: TextLayer;
  private resizeObserver?: ResizeObserver;
  private resizeTimer?: number;
  private page = 1;
  private pageCount = 0;
  private furthestPage = 1;
  private settings: PdfReaderSettings = getPdfReaderSettings();
  private bookmarks: PdfBookmarkRecord[] = [];
  private searchAbort?: AbortController;
  private searchResults: SearchResult[] = [];
  private activeQuery = '';
  private openGeneration = 0;
  private renderGeneration = 0;
  private destroyed = false;

  constructor(root: HTMLElement, candidate: PdfCanonicalCandidate) {
    this.root = root;
    this.candidate = candidate;
    this.elements = collectElements(root);
    this.device = new PdfDeviceController(root);
    this.device.start();
    this.bind();
  }

  private bind() {
    const { signal } = this.abort;
    this.elements.previous.addEventListener('click', () => void this.goToPage(this.page - 1), { signal });
    this.elements.next.addEventListener('click', () => void this.goToPage(this.page + 1), { signal });
    this.elements.pageInput.addEventListener('change', () => {
      void this.goToPage(Number(this.elements.pageInput.value));
    }, { signal });
    this.elements.zoomOut.addEventListener('click', () => void this.changeZoom(-ZOOM_STEP), { signal });
    this.elements.zoomIn.addEventListener('click', () => void this.changeZoom(ZOOM_STEP), { signal });
    this.elements.fit.addEventListener('change', () => {
      const value = this.elements.fit.value as PdfFitMode;
      this.settings.fit = value === 'page' || value === 'custom' ? value : 'width';
      setPdfReaderSettings(this.settings);
      void this.renderCurrentPage();
    }, { signal });
    this.elements.bookmark.addEventListener('click', () => void this.toggleCurrentBookmark(), { signal });
    this.elements.bookmarkToggle.addEventListener('click', () => this.openBookmarks(), { signal });
    this.elements.bookmarkClose.addEventListener('click', () => this.closeBookmarks(), { signal });
    this.elements.searchToggle.addEventListener('click', () => this.openSearch(), { signal });
    this.elements.searchClose.addEventListener('click', () => this.closeSearch(), { signal });
    this.elements.backdrop.addEventListener('click', () => this.closeActivePanel(), { signal });
    this.elements.searchSubmit.addEventListener('click', () => void this.search(this.elements.searchInput.value), { signal });
    this.elements.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.search(this.elements.searchInput.value);
      }
    }, { signal });
    document.addEventListener('keydown', (event) => {
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
    }, { signal });

    this.resizeObserver = new ResizeObserver(() => {
      if (this.settings.fit === 'custom' || !this.document) return;
      if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => void this.renderCurrentPage(), 120);
    });
    this.resizeObserver.observe(this.elements.viewport);
  }

  async open() {
    const generation = ++this.openGeneration;
    this.showBusy('Opening PDF…');
    this.elements.error.hidden = true;
    this.root.dataset.pdfReaderState = 'loading';
    performance.mark('pdf-reader:open-start');

    const source = typeof this.candidate.source === 'string'
      ? { url: this.candidate.source }
      : { data: this.candidate.source.slice(0) };

    this.loadingTask = getDocument({
      ...source,
      isEvalSupported: false,
      useSystemFonts: true,
      stopAtErrors: false,
    });

    const pdf = await this.loadingTask.promise;
    if (this.destroyed || generation !== this.openGeneration) {
      await pdf.destroy();
      return;
    }
    this.document = pdf;
    this.pageCount = pdf.numPages;
    this.elements.pageCount.textContent = String(this.pageCount);
    this.elements.pageInput.max = String(this.pageCount);

    try {
      const stored = await getPdfProgress(this.candidate.identity);
      if (stored && stored.pageCount === this.pageCount) {
        this.page = Math.min(this.pageCount, Math.max(1, stored.page));
        this.furthestPage = Math.max(this.page, stored.furthestPage);
      }
    } catch {
      this.root.dataset.pdfPersistence = 'session-only';
    }

    try {
      this.bookmarks = await getPdfBookmarks(this.candidate.identity);
    } catch {
      this.root.dataset.pdfBookmarks = 'session-only';
    }

    this.elements.fit.value = this.settings.fit;
    await this.renderCurrentPage();
    this.renderBookmarks();
    this.root.dataset.pdfReaderState = 'ready';
    this.root.removeAttribute('aria-busy');
    performance.mark('pdf-reader:first-ready');
    try { performance.measure('pdf-reader:open', 'pdf-reader:open-start', 'pdf-reader:first-ready'); } catch {}
  }

  private showBusy(message: string) {
    this.root.setAttribute('aria-busy', 'true');
    this.elements.status.hidden = false;
    this.elements.status.textContent = message;
  }

  private async renderCurrentPage() {
    const pdf = this.document;
    if (!pdf || this.destroyed) return;
    const requestedPage = Math.min(this.pageCount, Math.max(1, this.page));
    const generation = ++this.renderGeneration;
    this.root.dataset.pdfRenderGeneration = String(generation);
    this.page = requestedPage;
    this.showBusy(`Rendering page ${requestedPage}…`);
    this.renderTask?.cancel();
    this.textLayer?.cancel();
    let page: PDFPageProxy | undefined;

    try {
      page = await pdf.getPage(requestedPage);
      if (this.destroyed || generation !== this.renderGeneration || requestedPage !== this.page) return;
      const viewport = this.viewportForPage(page);
      await this.renderPage(page, viewport, generation);
      if (this.destroyed || generation !== this.renderGeneration || requestedPage !== this.page) return;

      this.elements.pageInput.value = String(requestedPage);
      this.elements.previous.disabled = requestedPage <= 1;
      this.elements.next.disabled = requestedPage >= this.pageCount;
      this.furthestPage = Math.max(this.furthestPage, requestedPage);
      this.elements.progress.textContent = `${Math.round((requestedPage / this.pageCount) * 100)}% · furthest ${Math.round((this.furthestPage / this.pageCount) * 100)}%`;
      this.elements.zoomLabel.textContent = `${Math.round(viewport.scale * 100)}%`;
      this.elements.status.textContent = `Page ${requestedPage} of ${this.pageCount}`;
      this.elements.status.hidden = false;
      this.updateBookmarkButton();
      this.highlightSearchMatches();

      try {
        const progress = await setPdfProgress(this.candidate.identity, requestedPage, this.pageCount);
        if (this.destroyed || generation !== this.renderGeneration || requestedPage !== this.page) return;
        this.furthestPage = progress.furthestPage;
        this.elements.progress.textContent = `${Math.round((requestedPage / this.pageCount) * 100)}% · furthest ${Math.round((this.furthestPage / this.pageCount) * 100)}%`;
      } catch {
        this.root.dataset.pdfPersistence = 'session-only';
      }
    } catch (error) {
      if (this.destroyed || generation !== this.renderGeneration || isRenderingCancellation(error)) return;
      throw error;
    } finally {
      try { page?.cleanup(); } catch {}
    }
  }

  private viewportForPage(page: PDFPageProxy) {
    const base = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(240, this.elements.viewport.clientWidth - 32);
    const availableHeight = Math.max(240, this.elements.viewport.clientHeight - 32);
    let scale = this.settings.zoom;
    if (this.settings.fit === 'width') scale = availableWidth / base.width;
    if (this.settings.fit === 'page') scale = Math.min(availableWidth / base.width, availableHeight / base.height);
    scale = clampZoom(scale);
    return page.getViewport({ scale });
  }

  private async renderPage(
    page: PDFPageProxy,
    viewport: ReturnType<PDFPageProxy['getViewport']>,
    generation: number,
  ) {
    const canvas = this.elements.canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    this.elements.textLayer.style.width = `${viewport.width}px`;
    this.elements.textLayer.style.height = `${viewport.height}px`;
    this.elements.textLayer.style.setProperty('--scale-factor', String(viewport.scale));

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    this.renderTask = renderTask;
    try {
      await renderTask.promise;
    } finally {
      if (this.renderTask === renderTask) delete this.renderTask;
    }
    if (this.destroyed || generation !== this.renderGeneration) return;

    this.elements.textLayer.replaceChildren();
    const textContent = await page.getTextContent();
    if (this.destroyed || generation !== this.renderGeneration) return;
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container: this.elements.textLayer,
      viewport,
    });
    this.textLayer = textLayer;
    try {
      await textLayer.render();
    } finally {
      if (this.textLayer === textLayer) delete this.textLayer;
    }
  }

  private async goToPage(page: number) {
    if (!this.document || !Number.isFinite(page)) return;
    const next = Math.min(this.pageCount, Math.max(1, Math.round(page)));
    if (next === this.page && this.root.dataset.pdfReaderState === 'ready') return;
    this.page = next;
    await this.renderCurrentPage();
  }

  private async changeZoom(delta: number) {
    const currentScale = Number.parseFloat(this.elements.zoomLabel.textContent ?? '') / 100;
    const base = Number.isFinite(currentScale) && currentScale > 0 ? currentScale : this.settings.zoom;
    this.settings = { schemaVersion: 1, fit: 'custom', zoom: clampZoom(base + delta) };
    this.elements.fit.value = 'custom';
    setPdfReaderSettings(this.settings);
    await this.renderCurrentPage();
  }

  private updateBookmarkButton() {
    const bookmarked = this.bookmarks.some((bookmark) => bookmark.page === this.page);
    this.elements.bookmark.setAttribute('aria-pressed', String(bookmarked));
    this.elements.bookmark.textContent = bookmarked ? 'Bookmarked' : 'Bookmark';
  }

  private async toggleCurrentBookmark() {
    try {
      const result = await togglePdfBookmark(this.candidate.identity, this.page);
      this.bookmarks = result.bookmarks;
      this.renderBookmarks();
      this.updateBookmarkButton();
      this.elements.status.textContent = result.bookmarked ? `Bookmarked page ${this.page}` : `Removed bookmark on page ${this.page}`;
    } catch {
      this.elements.status.textContent = 'Bookmark storage is unavailable in this browser session.';
    }
  }

  private renderBookmarks() {
    const list = this.elements.bookmarkList;
    list.replaceChildren();
    if (this.bookmarks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pdf-reader__empty';
      empty.textContent = 'No bookmarked pages yet.';
      list.append(empty);
      return;
    }
    for (const bookmark of this.bookmarks) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pdf-reader__result';
      button.textContent = bookmark.label;
      button.addEventListener('click', () => {
        this.closeBookmarks();
        void this.goToPage(bookmark.page);
      }, { signal: this.abort.signal });
      list.append(button);
    }
  }

  private setPanel(kind: 'search' | 'bookmarks' | null) {
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
    this.cancelSearch('Search cancelled.');
    this.setPanel(null);
    this.elements.searchToggle.focus();
  }

  private closeActivePanel() {
    if (!this.elements.searchPanel.hidden) this.closeSearch();
    else if (!this.elements.bookmarkPanel.hidden) this.closeBookmarks();
  }

  private cancelSearch(message?: string) {
    this.searchAbort?.abort();
    delete this.searchAbort;
    this.elements.searchSubmit.disabled = false;
    if (message) this.elements.searchStatus.textContent = message;
  }

  private async search(rawQuery: string) {
    const pdf = this.document;
    const query = rawQuery.trim();
    this.cancelSearch();
    if (!pdf || !query) {
      this.activeQuery = '';
      this.searchResults = [];
      this.renderSearchResults();
      this.highlightSearchMatches();
      return;
    }

    const controller = new AbortController();
    this.searchAbort = controller;
    const normalizedQuery = normalizeSearch(query);
    this.activeQuery = query;
    this.searchResults = [];
    this.elements.searchStatus.textContent = 'Searching book…';
    this.elements.searchSubmit.disabled = true;

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (controller.signal.aborted) return;
        const page = await pdf.getPage(pageNumber);
        try {
          const text = await page.getTextContent();
          if (controller.signal.aborted) return;
          const plain = text.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          const normalized = normalizeSearch(plain);
          const index = normalized.indexOf(normalizedQuery);
          if (index >= 0) {
            const start = Math.max(0, index - 55);
            const end = Math.min(plain.length, index + query.length + 90);
            this.searchResults.push({
              page: pageNumber,
              snippet: `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`,
            });
            if (this.searchResults.length >= MAX_SEARCH_RESULTS) break;
          }
        } finally {
          try { page.cleanup(); } catch {}
        }
        if (pageNumber % 4 === 0) {
          this.elements.searchStatus.textContent = `Searching… ${pageNumber} / ${pdf.numPages}`;
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
      if (controller.signal.aborted) return;
      this.renderSearchResults();
      this.highlightSearchMatches();
    } catch (error) {
      if (!controller.signal.aborted) this.elements.searchStatus.textContent = `Search unavailable: ${safeMessage(error)}`;
    } finally {
      if (this.searchAbort === controller) this.elements.searchSubmit.disabled = false;
    }
  }

  private renderSearchResults() {
    const list = this.elements.searchResults;
    list.replaceChildren();
    if (!this.activeQuery) {
      this.elements.searchStatus.textContent = 'Enter text to search this PDF.';
      return;
    }
    this.elements.searchStatus.textContent = this.searchResults.length >= MAX_SEARCH_RESULTS
      ? `${this.searchResults.length}+ matching pages`
      : `${this.searchResults.length} matching page${this.searchResults.length === 1 ? '' : 's'}`;
    if (this.searchResults.length === 0) return;
    for (const result of this.searchResults) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pdf-reader__result';
      const page = document.createElement('strong');
      page.textContent = `Page ${result.page}`;
      const snippet = document.createElement('span');
      snippet.textContent = result.snippet;
      button.append(page, snippet);
      button.addEventListener('click', () => {
        this.closeSearch();
        void this.goToPage(result.page);
      }, { signal: this.abort.signal });
      list.append(button);
    }
  }

  private highlightSearchMatches() {
    const query = normalizeSearch(this.activeQuery.trim());
    for (const node of this.elements.textLayer.querySelectorAll<HTMLElement>('span')) {
      node.classList.toggle('pdf-reader__search-hit', Boolean(query) && normalizeSearch(node.textContent ?? '').includes(query));
    }
  }

  showFailure(error: unknown) {
    this.root.dataset.pdfReaderState = 'error';
    this.root.removeAttribute('aria-busy');
    this.elements.error.hidden = false;
    this.elements.errorMessage.textContent = safeMessage(error);
    this.elements.status.hidden = true;
  }

  async retry() {
    await this.resetDocument();
    this.elements.error.hidden = true;
    try {
      await this.open();
    } catch (error) {
      this.showFailure(error);
    }
  }

  private async resetDocument() {
    this.renderGeneration += 1;
    this.renderTask?.cancel();
    this.textLayer?.cancel();
    delete this.renderTask;
    delete this.textLayer;
    this.cancelSearch();
    const loading = this.loadingTask;
    delete this.loadingTask;
    const document = this.document;
    delete this.document;
    try { await loading?.destroy(); } catch {}
    try { await document?.destroy(); } catch {}
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.device.destroy();
    this.abort.abort();
    this.resizeObserver?.disconnect();
    if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
    await this.resetDocument();
    this.root.dataset.pdfReaderState = 'destroyed';
  }
}

export async function mountPdfReader(root: HTMLElement, candidate: PdfCanonicalCandidate): Promise<PdfReaderHandle> {
  let controller = new PdfReaderController(root, candidate);
  let destroyed = false;
  const retryButton = required<HTMLButtonElement>(root, '[data-pdf-retry]');
  const click = () => void controller.retry();
  retryButton.addEventListener('click', click);

  try {
    await controller.open();
  } catch (error) {
    controller.showFailure(error);
  }

  return {
    async retry() {
      if (destroyed) return;
      await controller.retry();
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      retryButton.removeEventListener('click', click);
      await controller.destroy();
    },
  };
}
