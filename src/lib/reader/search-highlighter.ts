import { EpubCFI } from 'epubjs';

/**
 * Draws search-hit rectangles above the visible EPUB iframe without modifying publisher XHTML.
 * The overlay is pointer-transparent and is recomputed after iframe/view/scroll changes.
 */
export class ReaderSearchHighlighter {
  private readonly viewport: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly frameListeners = new Map<Window, EventListener>();
  private readonly observer: MutationObserver | undefined;
  private cfi: string | undefined;
  private frameId: number | null = null;
  private destroyed = false;

  constructor(viewport: HTMLElement) {
    this.viewport = viewport;
    this.layer = document.createElement('div');
    this.layer.className = 'reader-search-highlight-layer';
    this.layer.dataset.readerSearchHighlightLayer = '';
    this.layer.setAttribute('aria-hidden', 'true');
    viewport.append(this.layer);

    viewport.addEventListener('scroll', this.handleViewportChange, { passive: true });
    window.addEventListener('resize', this.handleViewportChange, { passive: true });
    this.observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => this.schedule())
      : undefined;
    this.observer?.observe(viewport, { childList: true, subtree: true });
  }

  set(cfi: string): void {
    if (!cfi.startsWith('epubcfi(')) return;
    this.cfi = cfi;
    this.schedule();
  }

  clear(): void {
    this.cfi = undefined;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.layer.replaceChildren();
  }

  refresh(): void {
    if (this.cfi) this.schedule();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
    this.observer?.disconnect();
    this.viewport.removeEventListener('scroll', this.handleViewportChange);
    window.removeEventListener('resize', this.handleViewportChange);
    for (const [frameWindow, listener] of this.frameListeners) {
      frameWindow.removeEventListener('scroll', listener);
      frameWindow.removeEventListener('resize', listener);
    }
    this.frameListeners.clear();
    this.layer.remove();
  }

  private readonly handleViewportChange = () => this.schedule();

  private schedule(): void {
    if (this.destroyed || !this.cfi) return;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.render();
    });
  }

  private render(): void {
    this.layer.replaceChildren();
    if (!this.cfi) return;

    const viewportRect = this.viewport.getBoundingClientRect();
    const cfi = new EpubCFI(this.cfi);
    const frames = this.viewport.querySelectorAll<HTMLIFrameElement>('iframe');

    for (const frame of frames) {
      const doc = frame.contentDocument;
      const frameWindow = doc?.defaultView;
      if (!doc || !frameWindow) continue;
      this.instrumentFrame(frameWindow);

      let range: Range;
      try {
        range = cfi.toRange(doc);
      } catch {
        continue;
      }

      const frameRect = frame.getBoundingClientRect();
      let rendered = false;
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const left = frameRect.left - viewportRect.left + rect.left;
        const top = frameRect.top - viewportRect.top + rect.top;
        const right = left + rect.width;
        const bottom = top + rect.height;
        if (right < 0 || bottom < 0 || left > viewportRect.width || top > viewportRect.height) continue;

        const hit = document.createElement('span');
        hit.className = 'reader-search-highlight';
        hit.style.left = `${left}px`;
        hit.style.top = `${top}px`;
        hit.style.width = `${rect.width}px`;
        hit.style.height = `${rect.height}px`;
        this.layer.append(hit);
        rendered = true;
      }
      if (rendered) break;
    }
  }

  private instrumentFrame(frameWindow: Window): void {
    if (this.frameListeners.has(frameWindow)) return;
    const listener: EventListener = () => this.schedule();
    this.frameListeners.set(frameWindow, listener);
    frameWindow.addEventListener('scroll', listener, { passive: true });
    frameWindow.addEventListener('resize', listener, { passive: true });
  }
}
