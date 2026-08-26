import type { ReaderController } from './controller';
import { ReaderSearchCache, type ReaderSearchCacheIdentity } from './search-cache';
import {
  EpubSearchEngine,
  normalizeReaderSearchQuery,
  type ReaderSearchMatch,
  type ReaderSearchProgress,
  type ReaderSearchResponse,
} from './search-engine';
import { ReaderSearchHighlighter } from './search-highlighter';
import type { ReaderShellController } from './shell';
import type { ReaderTocItem, Unsubscribe } from './types';

export type ReaderSearchStatus = 'idle' | 'searching' | 'ready' | 'error';

export interface ReaderSearchResult extends ReaderSearchMatch {
  chapterLabel: string;
}

export interface ReaderSearchState {
  open: boolean;
  query: string;
  status: ReaderSearchStatus;
  results: ReaderSearchResult[];
  scannedSections: number;
  totalSections: number;
  failedSections: number;
  truncated: boolean;
  fromCache: boolean;
  selectedCfi: string | undefined;
  message: string;
}

export interface ReaderSearchControllerOptions {
  identity?: ReaderSearchCacheIdentity;
  minQueryLength?: number;
  maxQueryLength?: number;
  maxResults?: number;
}

interface SearchUi {
  button: HTMLButtonElement;
  panel: HTMLElement;
  close: HTMLButtonElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  status: HTMLElement;
  results: HTMLOListElement;
}

const DEFAULT_MIN_QUERY_LENGTH = 2;
const DEFAULT_MAX_QUERY_LENGTH = 120;
export const READER_SEARCH_MAX_RESULTS = 200;
let searchUiSequence = 0;

function normalizeHref(value: string): string {
  let decoded = value.split('#')[0]?.split('?')[0] ?? '';
  try { decoded = decodeURIComponent(decoded); } catch {}
  return decoded.replace(/^\.\//, '').replace(/^\//, '').toLowerCase();
}

function flattenToc(items: ReaderTocItem[], output: ReaderTocItem[] = []): ReaderTocItem[] {
  for (const item of items) {
    output.push(item);
    flattenToc(item.children, output);
  }
  return output;
}

function resolveChapterLabel(href: string, toc: ReaderTocItem[], sectionIndex: number): string {
  const target = normalizeHref(href);
  const flat = flattenToc(toc, []);
  const exact = flat.find((item) => normalizeHref(item.href) === target);
  if (exact?.label.trim()) return exact.label.trim();
  const suffix = flat.find((item) => {
    const candidate = normalizeHref(item.href);
    return candidate && target && (candidate.endsWith(target) || target.endsWith(candidate));
  });
  if (suffix?.label.trim()) return suffix.label.trim();
  return `Section ${sectionIndex + 1}`;
}

function createSearchUi(root: HTMLElement): SearchUi {
  const cluster = root.querySelector<HTMLElement>('.reader-shell__cluster--end');
  if (!cluster) throw new Error('Reader search requires the top reader control cluster.');
  const appearanceButton = cluster.querySelector<HTMLElement>('[data-reader-command="appearance"]');
  const id = `reader-search-panel-${++searchUiSequence}`;

  const button = document.createElement('button');
  button.className = 'reader-shell__icon-button reader-search-toggle';
  button.type = 'button';
  button.dataset.readerSearchToggle = '';
  button.setAttribute('aria-label', 'Search inside book');
  button.setAttribute('title', 'Search inside book');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>';
  if (appearanceButton) cluster.insertBefore(button, appearanceButton);
  else cluster.append(button);

  const panel = document.createElement('section');
  panel.className = 'reader-search-panel';
  panel.id = id;
  panel.dataset.readerSearchPanel = '';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Search inside book');
  panel.innerHTML = `
    <div class="reader-search-panel__heading">
      <div><p>Find</p><h2>Search this book</h2></div>
      <button type="button" class="reader-search-panel__close" data-reader-search-close aria-label="Close search">×</button>
    </div>
    <form class="reader-search-form" data-reader-search-form role="search">
      <label for="${id}-input">Search text</label>
      <div class="reader-search-form__row">
        <input id="${id}-input" data-reader-search-input type="search" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Find a word or phrase" />
        <button type="submit">Search</button>
      </div>
    </form>
    <p class="reader-search-status" data-reader-search-status role="status" aria-live="polite">Search the full EPUB.</p>
    <ol class="reader-search-results" data-reader-search-results aria-label="Search results"></ol>
  `;
  const stage = root.querySelector<HTMLElement>('[data-reader-stage]');
  root.insertBefore(panel, stage ?? null);

  const close = panel.querySelector<HTMLButtonElement>('[data-reader-search-close]');
  const form = panel.querySelector<HTMLFormElement>('[data-reader-search-form]');
  const input = panel.querySelector<HTMLInputElement>('[data-reader-search-input]');
  const status = panel.querySelector<HTMLElement>('[data-reader-search-status]');
  const results = panel.querySelector<HTMLOListElement>('[data-reader-search-results]');
  if (!close || !form || !input || !status || !results) throw new Error('Reader search UI could not initialize.');
  return { button, panel, close, form, input, status, results };
}

function appendHighlightedExcerpt(container: HTMLElement, excerpt: string, query: string): void {
  const normalizedExcerpt = excerpt.normalize('NFC').replace(/\s+/g, ' ').trim();
  const normalizedQuery = query.normalize('NFC');
  const index = normalizedExcerpt.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (index < 0 || !normalizedQuery) {
    container.textContent = normalizedExcerpt;
    return;
  }
  container.append(document.createTextNode(normalizedExcerpt.slice(0, index)));
  const mark = document.createElement('mark');
  mark.textContent = normalizedExcerpt.slice(index, index + normalizedQuery.length);
  container.append(mark, document.createTextNode(normalizedExcerpt.slice(index + normalizedQuery.length)));
}

export class ReaderSearchController {
  private readonly controller: ReaderController;
  private readonly shell: ReaderShellController;
  private readonly engine: EpubSearchEngine;
  private readonly cache = new ReaderSearchCache();
  private readonly highlighter: ReaderSearchHighlighter;
  private readonly identity: ReaderSearchCacheIdentity | undefined;
  private readonly minQueryLength: number;
  private readonly maxQueryLength: number;
  private readonly maxResults: number;
  private readonly ui: SearchUi;
  private state: ReaderSearchState = {
    open: false,
    query: '',
    status: 'idle',
    results: [],
    scannedSections: 0,
    totalSections: 0,
    failedSections: 0,
    truncated: false,
    fromCache: false,
    selectedCfi: undefined,
    message: 'Search the full EPUB.',
  };
  private listeners = new Set<(state: ReaderSearchState) => void>();
  private cleanups: Unsubscribe[] = [];
  private abortController: AbortController | undefined;
  private revision = 0;
  private started = false;
  private destroyed = false;

  constructor(
    controller: ReaderController,
    shell: ReaderShellController,
    source: string | ArrayBuffer,
    options: ReaderSearchControllerOptions = {},
  ) {
    this.controller = controller;
    this.shell = shell;
    this.engine = new EpubSearchEngine(source);
    this.identity = options.identity;
    this.minQueryLength = Math.max(1, Math.min(10, Math.round(options.minQueryLength ?? DEFAULT_MIN_QUERY_LENGTH)));
    this.maxQueryLength = Math.max(this.minQueryLength, Math.min(300, Math.round(options.maxQueryLength ?? DEFAULT_MAX_QUERY_LENGTH)));
    this.maxResults = Math.max(1, Math.min(500, Math.round(options.maxResults ?? READER_SEARCH_MAX_RESULTS)));
    this.ui = createSearchUi(shell.root);
    this.highlighter = new ReaderSearchHighlighter(shell.viewport);
    this.ui.button.disabled = controller.snapshot.status !== 'ready';
  }

  get snapshot(): ReaderSearchState {
    return { ...this.state, results: this.state.results.map((result) => ({ ...result })) };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;
    this.ui.button.addEventListener('click', this.handleToggle);
    this.ui.close.addEventListener('click', this.handleClose);
    this.ui.form.addEventListener('submit', this.handleSubmit);
    this.ui.input.addEventListener('input', this.handleInput);
    this.ui.input.addEventListener('keydown', this.handleInputKeydown);
    this.ui.results.addEventListener('click', this.handleResultClick);
    this.ui.results.addEventListener('keydown', this.handleResultKeydown);
    document.addEventListener('keydown', this.handleDocumentKeydown, true);
    this.shell.root.addEventListener('reader-shell:toggle-controls', this.handleShellToggle as EventListener);

    this.cleanups.push(this.shell.onCommand((command) => {
      if (command === 'appearance' || command === 'more' || command === 'contents') this.close(false);
    }));
    this.cleanups.push(this.controller.subscribe((state) => {
      const ready = state.status === 'ready';
      this.ui.button.disabled = !ready;
      if (!ready) {
        this.abortController?.abort();
        this.highlighter.clear();
        this.close(false);
      } else if (this.state.selectedCfi && state.location) {
        this.highlighter.refresh();
      }
    }));
  }

  subscribe(listener: (state: ReaderSearchState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  open(): void {
    this.assertUsable();
    if (this.controller.snapshot.status !== 'ready') return;
    this.shell.setAppearancePanelOpen(false);
    this.shell.setModePanelOpen(false);
    this.ui.panel.hidden = false;
    this.ui.button.setAttribute('aria-expanded', 'true');
    this.patchState({ open: true });
    queueMicrotask(() => {
      if (!this.destroyed && this.state.open) {
        this.ui.input.focus({ preventScroll: true });
        this.ui.input.select();
      }
    });
  }

  close(returnFocus = true): void {
    if (this.destroyed || this.ui.panel.hidden) return;
    this.ui.panel.hidden = true;
    this.ui.button.setAttribute('aria-expanded', 'false');
    this.patchState({ open: false });
    if (returnFocus) this.ui.button.focus({ preventScroll: true });
  }

  toggle(): void {
    if (this.ui.panel.hidden) this.open();
    else this.close();
  }

  async search(rawQuery: string): Promise<void> {
    this.assertUsable();
    const query = normalizeReaderSearchQuery(rawQuery);
    if (query.length < this.minQueryLength) {
      this.abortController?.abort();
      this.highlighter.clear();
      this.patchState({
        query,
        status: 'idle',
        results: [],
        scannedSections: 0,
        totalSections: 0,
        failedSections: 0,
        truncated: false,
        fromCache: false,
        selectedCfi: undefined,
        message: `Enter at least ${this.minQueryLength} characters.`,
      }, true);
      return;
    }
    if (query.length > this.maxQueryLength) {
      this.patchState({ status: 'error', message: `Search terms are limited to ${this.maxQueryLength} characters.` });
      return;
    }

    const revision = ++this.revision;
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    this.highlighter.clear();
    this.patchState({
      query,
      status: 'searching',
      results: [],
      scannedSections: 0,
      totalSections: 0,
      failedSections: 0,
      truncated: false,
      fromCache: false,
      selectedCfi: undefined,
      message: 'Searching book…',
    }, true);

    try {
      const cached = this.identity ? await this.cache.get(this.identity, query) : undefined;
      if (revision !== this.revision || abortController.signal.aborted) return;
      if (cached) {
        this.finishSearch(query, cached, true);
        return;
      }

      const response = await this.engine.search(query, {
        maxResults: this.maxResults,
        signal: abortController.signal,
        onProgress: (progress) => {
          if (revision !== this.revision || abortController.signal.aborted) return;
          this.updateProgress(progress);
        },
      });
      if (revision !== this.revision || abortController.signal.aborted) return;
      if (this.identity) void this.cache.set(this.identity, query, response);
      this.finishSearch(query, response, false);
    } catch (error) {
      if (revision !== this.revision || abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      const message = error instanceof Error ? error.message : 'Unable to search this EPUB.';
      this.patchState({ status: 'error', message });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortController?.abort();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.ui.button.removeEventListener('click', this.handleToggle);
    this.ui.close.removeEventListener('click', this.handleClose);
    this.ui.form.removeEventListener('submit', this.handleSubmit);
    this.ui.input.removeEventListener('input', this.handleInput);
    this.ui.input.removeEventListener('keydown', this.handleInputKeydown);
    this.ui.results.removeEventListener('click', this.handleResultClick);
    this.ui.results.removeEventListener('keydown', this.handleResultKeydown);
    document.removeEventListener('keydown', this.handleDocumentKeydown, true);
    this.shell.root.removeEventListener('reader-shell:toggle-controls', this.handleShellToggle as EventListener);
    this.highlighter.destroy();
    this.engine.destroy();
    this.listeners.clear();
    this.ui.panel.remove();
    this.ui.button.remove();
  }

  private finishSearch(query: string, response: ReaderSearchResponse, fromCache: boolean): void {
    const toc = this.controller.snapshot.toc;
    const results = response.results.map((match) => ({
      ...match,
      chapterLabel: resolveChapterLabel(match.href, toc, match.sectionIndex),
    }));
    let message = results.length === 0 ? `No matches for “${query}”.` : `${results.length} match${results.length === 1 ? '' : 'es'}.`;
    if (response.truncated) message = `${message} Showing the first ${results.length}.`;
    if (response.failedSections > 0) message = `${message} ${response.failedSections} section${response.failedSections === 1 ? '' : 's'} could not be searched.`;
    this.patchState({
      query,
      status: 'ready',
      results,
      scannedSections: response.scannedSections,
      totalSections: response.totalSections,
      failedSections: response.failedSections,
      truncated: response.truncated,
      fromCache,
      message,
    }, true);
  }

  private updateProgress(progress: ReaderSearchProgress): void {
    const message = progress.totalSections > 0
      ? `Searching ${progress.scannedSections} of ${progress.totalSections} sections… ${progress.resultCount} found.`
      : 'Searching book…';
    this.patchState({
      scannedSections: progress.scannedSections,
      totalSections: progress.totalSections,
      message,
    });
  }

  private renderResults(): void {
    this.ui.results.replaceChildren();
    for (const [index, result] of this.state.results.entries()) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reader-search-result';
      button.dataset.readerSearchCfi = result.cfi;
      button.dataset.readerSearchIndex = String(index);
      button.setAttribute('aria-label', `Result ${index + 1} of ${this.state.results.length}, ${result.chapterLabel}`);

      const meta = document.createElement('span');
      meta.className = 'reader-search-result__meta';
      meta.textContent = `${result.chapterLabel} · ${index + 1}`;
      const excerpt = document.createElement('span');
      excerpt.className = 'reader-search-result__excerpt';
      appendHighlightedExcerpt(excerpt, result.excerpt || this.state.query, this.state.query);
      button.append(meta, excerpt);
      item.append(button);
      this.ui.results.append(item);
    }
  }

  private async openResult(button: HTMLButtonElement): Promise<void> {
    const cfi = button.dataset.readerSearchCfi;
    const index = Number(button.dataset.readerSearchIndex ?? '0');
    if (!cfi?.startsWith('epubcfi(')) return;
    try {
      await this.controller.goTo(cfi);
      this.patchState({ selectedCfi: cfi });
      this.highlighter.set(cfi);
      this.close(false);
      this.shell.viewport.focus({ preventScroll: true });
      this.shell.announce(`Opened search result ${index + 1} of ${this.state.results.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this search result.';
      this.patchState({ status: 'error', message });
    }
  }

  private patchState(patch: Partial<ReaderSearchState>, rerenderResults = false): void {
    this.state = { ...this.state, ...patch };
    this.ui.status.textContent = this.state.message;
    if (rerenderResults) this.renderResults();
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private resultButtons(): HTMLButtonElement[] {
    return [...this.ui.results.querySelectorAll<HTMLButtonElement>('[data-reader-search-cfi]')];
  }

  private readonly handleToggle = () => this.toggle();
  private readonly handleClose = () => this.close();
  private readonly handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void this.search(this.ui.input.value);
  };
  private readonly handleInput = () => {
    if (!this.ui.input.value.trim()) {
      this.abortController?.abort();
      this.revision += 1;
      this.highlighter.clear();
      this.patchState({
        query: '',
        status: 'idle',
        results: [],
        scannedSections: 0,
        totalSections: 0,
        failedSections: 0,
        truncated: false,
        fromCache: false,
        selectedCfi: undefined,
        message: 'Search the full EPUB.',
      }, true);
    }
  };
  private readonly handleInputKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown') return;
    const first = this.resultButtons()[0];
    if (!first) return;
    event.preventDefault();
    first.focus();
  };
  private readonly handleResultClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-reader-search-cfi]') : null;
    if (!target || !this.ui.results.contains(target)) return;
    void this.openResult(target);
  };
  private readonly handleResultKeydown = (event: KeyboardEvent) => {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches('[data-reader-search-cfi]')) return;
    const buttons = this.resultButtons();
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    let target: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') target = buttons[index + 1] ?? buttons[0];
    if (event.key === 'ArrowUp') target = buttons[index - 1] ?? buttons.at(-1);
    if (event.key === 'Home') target = buttons[0];
    if (event.key === 'End') target = buttons.at(-1);
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.state.open) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  };
  private readonly handleShellToggle = () => {
    if (this.state.open) this.close(false);
  };

  private assertUsable(): void {
    if (this.destroyed) throw new Error('ReaderSearchController has been destroyed.');
  }
}
