import '../../styles/reader-page-layout.css';
import { ReaderReadingModeController } from './reading-mode';
import type { ReaderPageMargins, ReaderTextWidth, Unsubscribe } from './types';

export interface ReaderPageLayoutState {
  textWidth: ReaderTextWidth;
  pageMargins: ReaderPageMargins;
}

export type ReaderPageLayoutOptions = Partial<ReaderPageLayoutState>;

export const READER_PAGE_LAYOUT_DEFAULTS: ReaderPageLayoutState = {
  textWidth: 'medium',
  pageMargins: 'medium',
};

function normalize(options: ReaderPageLayoutOptions): ReaderPageLayoutState {
  return {
    textWidth: options.textWidth ?? READER_PAGE_LAYOUT_DEFAULTS.textWidth,
    pageMargins: options.pageMargins ?? READER_PAGE_LAYOUT_DEFAULTS.pageMargins,
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export class ReaderPageLayoutController {
  private readonly readingMode: ReaderReadingModeController;
  private readonly root: HTMLElement;
  private readonly controlsHost: HTMLElement;
  private readonly listeners = new Set<(state: ReaderPageLayoutState) => void>();
  private state: ReaderPageLayoutState;
  private queue: Promise<void> = Promise.resolve();
  private applyVersion = 0;
  private destroyed = false;

  constructor(readingMode: ReaderReadingModeController, root: HTMLElement, initial: ReaderPageLayoutOptions = {}) {
    this.readingMode = readingMode;
    this.root = root;
    this.state = normalize(initial);
    this.controlsHost = this.mountControls();
    this.root.addEventListener('click', this.handleClick);
    this.syncDom();
  }

  get snapshot(): ReaderPageLayoutState {
    return { ...this.state };
  }

  async start(): Promise<void> {
    this.assertUsable();
    this.emit();
    await this.apply(true);
  }

  async reapply(): Promise<void> {
    this.assertUsable();
    this.syncDom();
    await this.apply(true);
  }

  async setTextWidth(textWidth: ReaderTextWidth): Promise<void> {
    await this.update({ textWidth });
  }

  async setPageMargins(pageMargins: ReaderPageMargins): Promise<void> {
    await this.update({ pageMargins });
  }

  async reset(): Promise<void> {
    this.assertUsable();
    this.state = { ...READER_PAGE_LAYOUT_DEFAULTS };
    this.syncDom();
    this.emit();
    await this.apply(true);
  }

  subscribe(listener: (state: ReaderPageLayoutState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.applyVersion += 1;
    this.root.removeEventListener('click', this.handleClick);
    this.controlsHost.remove();
    this.listeners.clear();
  }

  private async update(patch: ReaderPageLayoutOptions): Promise<void> {
    this.assertUsable();
    const next = normalize({ ...this.state, ...patch });
    if (next.textWidth === this.state.textWidth && next.pageMargins === this.state.pageMargins) return;
    this.state = next;
    this.syncDom();
    this.emit();
    await this.apply(false);
  }

  private async apply(force: boolean): Promise<void> {
    const version = ++this.applyVersion;
    const task = async () => {
      if (this.destroyed) return;
      if (!force && version !== this.applyVersion) return;
      await nextFrame();
      await this.readingMode.reapply();
    };
    const scheduled = this.queue.then(task, task);
    this.queue = scheduled.catch(() => undefined);
    await scheduled;
  }

  private mountControls(): HTMLElement {
    const existing = this.root.querySelector<HTMLElement>('[data-reader-page-layout-controls]');
    if (existing) return existing;
    const panel = this.root.querySelector<HTMLElement>('[data-reader-appearance-panel]');
    if (!panel) throw new Error('Reader appearance panel is required for page-layout controls.');

    const section = document.createElement('section');
    section.className = 'reader-shell__page-layout-controls';
    section.dataset.readerPageLayoutControls = '';
    section.innerHTML = `
      <div class="reader-shell__page-layout-heading">
        <h3>Page layout</h3>
        <button type="button" class="reader-shell__page-layout-reset" data-reader-page-layout-reset>Reset layout</button>
      </div>
      <div class="reader-shell__page-layout-label">Reading width</div>
      <div class="reader-shell__page-layout-group" role="group" aria-label="Reading width">
        <button type="button" data-reader-page-layout-property="textWidth" data-reader-page-layout-value="narrow" data-reader-text-width-option="narrow" aria-pressed="false">Narrow</button>
        <button type="button" data-reader-page-layout-property="textWidth" data-reader-page-layout-value="medium" data-reader-text-width-option="medium" aria-pressed="true">Medium</button>
        <button type="button" data-reader-page-layout-property="textWidth" data-reader-page-layout-value="wide" data-reader-text-width-option="wide" aria-pressed="false">Wide</button>
      </div>
      <div class="reader-shell__page-layout-label">Page margins</div>
      <div class="reader-shell__page-layout-group" role="group" aria-label="Page margins">
        <button type="button" data-reader-page-layout-property="pageMargins" data-reader-page-layout-value="small" data-reader-page-margins-option="small" aria-pressed="false">Small</button>
        <button type="button" data-reader-page-layout-property="pageMargins" data-reader-page-layout-value="medium" data-reader-page-margins-option="medium" aria-pressed="true">Medium</button>
        <button type="button" data-reader-page-layout-property="pageMargins" data-reader-page-layout-value="large" data-reader-page-margins-option="large" aria-pressed="false">Large</button>
      </div>
      <p class="reader-shell__page-layout-note">The reading canvas and margins adapt to the available screen size. Automatic spreads recalculate from the resulting page width.</p>
    `;
    panel.append(section);
    return section;
  }

  private syncDom(): void {
    this.root.dataset.readerTextWidth = this.state.textWidth;
    this.root.dataset.readerPageMargins = this.state.pageMargins;
    this.controlsHost.querySelectorAll<HTMLButtonElement>('[data-reader-text-width-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.readerTextWidthOption === this.state.textWidth));
    });
    this.controlsHost.querySelectorAll<HTMLButtonElement>('[data-reader-page-margins-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.readerPageMarginsOption === this.state.pageMargins));
    });
  }

  private readonly handleClick = (event: MouseEvent) => {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin) return;
    const reset = origin.closest<HTMLElement>('[data-reader-page-layout-reset]');
    if (reset && this.controlsHost.contains(reset)) {
      void this.reset();
      return;
    }
    const option = origin.closest<HTMLElement>('[data-reader-page-layout-property][data-reader-page-layout-value]');
    if (!option || !this.controlsHost.contains(option)) return;
    const property = option.dataset.readerPageLayoutProperty;
    const value = option.dataset.readerPageLayoutValue;
    if (property === 'textWidth' && (value === 'narrow' || value === 'medium' || value === 'wide')) {
      void this.setTextWidth(value);
    }
    if (property === 'pageMargins' && (value === 'small' || value === 'medium' || value === 'large')) {
      void this.setPageMargins(value);
    }
  };

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader page-layout controller has been destroyed.');
  }
}
