import { EpubCFI } from 'epubjs';
import type { ReaderAnnotationRecordV2 } from './annotation-store';

/** Draws persistent annotation ranges above visible EPUB iframes without modifying publication XHTML. */
export class ReaderAnnotationHighlighter {
  private readonly viewport: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly frameListeners = new Map<Window, EventListener>();
  private readonly observer: MutationObserver | undefined;
  private annotations: ReaderAnnotationRecordV2[] = [];
  private frameId: number | null = null;
  private destroyed = false;

  constructor(viewport: HTMLElement) {
    this.viewport = viewport;
    this.layer = document.createElement('div');
    this.layer.className = 'reader-annotation-highlight-layer';
    this.layer.dataset.readerAnnotationHighlightLayer = '';
    this.layer.setAttribute('aria-hidden', 'true');
    viewport.append(this.layer);
    viewport.addEventListener('scroll', this.handleViewportChange, { passive: true });
    window.addEventListener('resize', this.handleViewportChange, { passive: true });
    this.observer = typeof MutationObserver === 'function'
      ? new MutationObserver((records) => {
          const external = records.some((record) => record.target !== this.layer && !this.layer.contains(record.target));
          if (external) this.schedule();
        })
      : undefined;
    this.observer?.observe(viewport, { childList: true, subtree: true });
  }

  set(annotations: ReaderAnnotationRecordV2[]): void {
    this.annotations = annotations.map((annotation) => ({ ...annotation }));
    if (this.annotations.length) this.schedule();
    else this.clearRendered();
  }

  refresh(): void {
    if (this.annotations.length) this.schedule();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.observer?.disconnect();
    this.viewport.removeEventListener('scroll', this.handleViewportChange);
    window.removeEventListener('resize', this.handleViewportChange);
    for (const [frameWindow, listener] of this.frameListeners) {
      frameWindow.removeEventListener('scroll', listener);
      frameWindow.removeEventListener('resize', listener);
    }
    this.frameListeners.clear();
    this.layer.remove();
    this.annotations = [];
  }

  private readonly handleViewportChange = () => this.schedule();

  private schedule(): void {
    if (this.destroyed) return;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.render();
    });
  }

  private clearRendered(): void {
    this.layer.replaceChildren();
  }

  private render(): void {
    this.clearRendered();
    if (!this.annotations.length) return;
    const viewportRect = this.viewport.getBoundingClientRect();
    const frames = this.viewport.querySelectorAll<HTMLIFrameElement>('iframe');

    for (const annotation of this.annotations) {
      const cfi = new EpubCFI(annotation.cfiRange);
      for (const frame of frames) {
        const doc = frame.contentDocument;
        const frameWindow = doc?.defaultView;
        if (!doc || !frameWindow) continue;
        this.instrumentFrame(frameWindow);
        let range: Range;
        try { range = cfi.toRange(doc); } catch { continue; }
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
          hit.className = annotation.note.trim()
            ? 'reader-annotation-highlight reader-annotation-highlight--note'
            : 'reader-annotation-highlight';
          hit.dataset.readerAnnotationHighlight = annotation.id;
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
  }

  private instrumentFrame(frameWindow: Window): void {
    if (this.frameListeners.has(frameWindow)) return;
    const listener: EventListener = () => this.schedule();
    this.frameListeners.set(frameWindow, listener);
    frameWindow.addEventListener('scroll', listener, { passive: true });
    frameWindow.addEventListener('resize', listener, { passive: true });
  }
}
