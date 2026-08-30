import type { ReaderNavigationController } from './navigation';
import type { ReaderShellController } from './shell';

const WHEEL_THRESHOLD_PX = 60;
const WHEEL_IDLE_MS = 180;
const WHEEL_TURN_COOLDOWN_MS = 260;
const WHEEL_LINE_PX = 16;
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="slider"]',
].join(',');
const OPEN_PANEL_SELECTOR = [
  '[data-reader-toc-panel]:not([hidden])',
  '[data-reader-appearance-panel]:not([hidden])',
  '[data-reader-mode-panel]:not([hidden])',
  '[data-reader-search-panel]:not([hidden])',
  '[data-reader-bookmarks-panel]:not([hidden])',
  '[data-reader-annotations-panel]:not([hidden])',
  '[data-reader-selection-actions]:not([hidden])',
].join(',');

function isInteractiveTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  return typeof candidate?.closest === 'function' && Boolean(candidate.closest(INTERACTIVE_SELECTOR));
}

function hasSelection(document: Document): boolean {
  return Boolean(document.defaultView?.getSelection()?.toString().trim());
}

/**
 * Desktop wheel/trackpad adapter for paginated EPUB reading.
 *
 * A vertical scroll down/right advances one page and up/left goes back. Small
 * trackpad deltas accumulate, while a short cooldown absorbs momentum so a
 * single gesture cannot skip several pages. Scrolled reading mode is never
 * intercepted and keeps native browser scrolling.
 */
export class ReaderWheelNavigationController {
  private readonly instrumentedDocuments = new Set<Document>();
  private readonly frameLoadHandlers = new Map<HTMLIFrameElement, EventListener>();
  private mutationObserver: MutationObserver | undefined;
  private wheelAccumulator = 0;
  private lastTurnAt = -Infinity;
  private resetTimer: number | undefined;
  private started = false;
  private destroyed = false;

  constructor(
    private readonly shell: ReaderShellController,
    private readonly navigation: ReaderNavigationController,
  ) {}

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;

    this.shell.viewport.addEventListener('wheel', this.handleWheel, { passive: false });
    this.instrumentFrames();

    const MutationObserverCtor = (globalThis as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    if (!MutationObserverCtor) return;
    this.mutationObserver = new MutationObserverCtor(() => this.instrumentFrames());
    this.mutationObserver.observe(this.shell.viewport, { childList: true, subtree: true });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mutationObserver?.disconnect();
    this.mutationObserver = undefined;
    this.shell.viewport.removeEventListener('wheel', this.handleWheel);

    for (const [frame, handler] of this.frameLoadHandlers) frame.removeEventListener('load', handler);
    this.frameLoadHandlers.clear();
    for (const document of this.instrumentedDocuments) document.removeEventListener('wheel', this.handleWheel, true);
    this.instrumentedDocuments.clear();

    const win = this.shell.root.ownerDocument.defaultView;
    if (win && this.resetTimer !== undefined) win.clearTimeout(this.resetTimer);
    this.resetTimer = undefined;
    this.wheelAccumulator = 0;
  }

  private instrumentFrames(): void {
    this.shell.viewport.querySelectorAll<HTMLIFrameElement>('iframe').forEach((frame) => {
      if (!this.frameLoadHandlers.has(frame)) {
        const loadHandler: EventListener = () => this.installFrameDocument(frame);
        frame.addEventListener('load', loadHandler);
        this.frameLoadHandlers.set(frame, loadHandler);
      }
      this.installFrameDocument(frame);
    });
  }

  private installFrameDocument(frame: HTMLIFrameElement): void {
    let document: Document | null = null;
    try {
      document = frame.contentDocument;
    } catch {
      return;
    }
    if (!document || this.instrumentedDocuments.has(document)) return;
    this.instrumentedDocuments.add(document);
    document.addEventListener('wheel', this.handleWheel, { capture: true, passive: false });
  }

  private readonly handleWheel = (event: WheelEvent) => {
    if (this.destroyed || !this.isDesktopInput()) return;
    if (this.shell.root.dataset.readerFlow !== 'paginated') return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (this.shell.root.querySelector(OPEN_PANEL_SELECTOR)) return;
    if (isInteractiveTarget(event.target)) return;

    const currentTarget = event.currentTarget as { nodeType?: number } | null;
    const document = currentTarget?.nodeType === 9
      ? currentTarget as unknown as Document
      : this.shell.root.ownerDocument;
    if (hasSelection(document)) return;

    const delta = this.normalizedDelta(event);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return;

    // Paginated readers own wheel intent. Native scrolling is preserved by the
    // early flow check above for scrolled mode.
    event.preventDefault();
    this.scheduleAccumulatorReset();

    const sign = Math.sign(delta);
    if (this.wheelAccumulator && Math.sign(this.wheelAccumulator) !== sign) this.wheelAccumulator = 0;
    this.wheelAccumulator += delta;
    if (Math.abs(this.wheelAccumulator) < WHEEL_THRESHOLD_PX) return;

    const now = performance.now();
    this.wheelAccumulator = 0;
    if (this.navigation.snapshot.busy || now - this.lastTurnAt < WHEEL_TURN_COOLDOWN_MS) return;

    this.lastTurnAt = now;
    void this.navigation.navigate(delta > 0 ? 'next' : 'previous', 'button');
  };

  private normalizedDelta(event: WheelEvent): number {
    const raw = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (event.deltaMode === 1) return raw * WHEEL_LINE_PX;
    if (event.deltaMode === 2) return raw * Math.max(1, this.shell.viewport.clientHeight);
    return raw;
  }

  private isDesktopInput(): boolean {
    const win = this.shell.root.ownerDocument.defaultView;
    if (!win) return false;
    if (win.matchMedia('(hover: hover) and (pointer: fine)').matches) return true;
    return win.navigator.maxTouchPoints === 0 && !win.matchMedia('(pointer: coarse)').matches;
  }

  private scheduleAccumulatorReset(): void {
    const win = this.shell.root.ownerDocument.defaultView;
    if (!win) return;
    if (this.resetTimer !== undefined) win.clearTimeout(this.resetTimer);
    this.resetTimer = win.setTimeout(() => {
      this.wheelAccumulator = 0;
      this.resetTimer = undefined;
    }, WHEEL_IDLE_MS);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('ReaderWheelNavigationController has been destroyed.');
  }
}
