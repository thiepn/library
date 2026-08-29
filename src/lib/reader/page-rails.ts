import type {
  ReaderNavigationController,
  ReaderNavigationDirection,
  ReaderNavigationState,
} from './navigation';
import type { ReaderShellController } from './shell';
import type { Unsubscribe } from './types';

const EDGE_RATIO = 1 / 3;
const MAX_MOUSE_TAP_MS = 650;
const MAX_MOUSE_TAP_DISTANCE_PX = 14;
const COMPATIBILITY_CLICK_WINDOW_MS = 900;
const COMPATIBILITY_CLICK_DISTANCE_PX = 18;
const GEOMETRY_TOLERANCE_PX = 2;
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
].join(',');

type MousePointerStart = {
  x: number;
  y: number;
  time: number;
};

type HandledMouseTap = {
  document: Document;
  x: number;
  y: number;
  time: number;
};

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  return typeof candidate?.closest === 'function' && Boolean(candidate.closest(INTERACTIVE_SELECTOR));
}

function hasSelection(document: Document): boolean {
  return Boolean(document.defaultView?.getSelection()?.toString().trim());
}

function createArrow(direction: ReaderNavigationDirection): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', direction === 'previous' ? 'M15 5 8 12l7 7' : 'm9 5 7 7-7 7');
  svg.append(path);
  return svg;
}

function createRail(direction: ReaderNavigationDirection): HTMLButtonElement {
  const button = document.createElement('button');
  const label = direction === 'previous' ? 'Previous page' : 'Next page';
  button.type = 'button';
  button.className = `reader-shell__page-rail reader-shell__page-rail--${direction}`;
  button.dataset.readerPageRail = direction;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = true;
  button.hidden = true;
  button.append(createArrow(direction));
  return button;
}

/**
 * Desktop navigation adapter.
 *
 * Page rails call the existing ReaderNavigationController directly. The same adapter also owns a
 * fine-pointer compatibility bridge inside EPUB iframes: EPUB.js can expose a multi-column iframe
 * that is wider than the visible reader viewport, and Firefox can report mouse coordinates in a
 * different slice space after a paginated scroll. Normalizing against the actually visible frame
 * intersection keeps left / center / right intent stable without changing touch, pen, selection,
 * link, keyboard, or native scroll behavior.
 */
export class ReaderPageRailController {
  private readonly shell: ReaderShellController;
  private readonly navigation: ReaderNavigationController;
  private readonly previous = createRail('previous');
  private readonly next = createRail('next');
  private readonly instrumentedDocuments = new Set<Document>();
  private readonly frameByDocument = new WeakMap<Document, HTMLIFrameElement>();
  private readonly pointerStartByDocument = new WeakMap<Document, MousePointerStart>();
  private readonly frameLoadHandlers = new Map<HTMLIFrameElement, EventListener>();
  private mutationObserver: MutationObserver | undefined;
  private lastHandledMouseTap: HandledMouseTap | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private started = false;
  private destroyed = false;

  constructor(shell: ReaderShellController, navigation: ReaderNavigationController) {
    this.shell = shell;
    this.navigation = navigation;
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;

    const stage = this.shell.root.querySelector<HTMLElement>('[data-reader-stage]');
    if (!stage) throw new Error('Reader shell is missing required element: [data-reader-stage]');

    stage.append(this.previous, this.next);
    this.previous.addEventListener('click', this.handlePrevious);
    this.next.addEventListener('click', this.handleNext);
    this.unsubscribe = this.navigation.subscribe((state) => this.applyState(state));
    this.startDesktopMouseBridge();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.mutationObserver?.disconnect();
    this.mutationObserver = undefined;

    for (const [frame, handler] of this.frameLoadHandlers) frame.removeEventListener('load', handler);
    this.frameLoadHandlers.clear();
    for (const document of this.instrumentedDocuments) this.removeDocumentBridge(document);
    this.instrumentedDocuments.clear();

    this.previous.removeEventListener('click', this.handlePrevious);
    this.next.removeEventListener('click', this.handleNext);
    this.previous.remove();
    this.next.remove();
    this.lastHandledMouseTap = undefined;
  }

  private readonly handlePrevious = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void this.navigation.navigate('previous', 'button');
  };

  private readonly handleNext = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void this.navigation.navigate('next', 'button');
  };

  private startDesktopMouseBridge(): void {
    this.instrumentFrames();
    const MutationObserverCtor = (globalThis as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    if (!MutationObserverCtor) return;
    this.mutationObserver = new MutationObserverCtor(() => this.instrumentFrames());
    this.mutationObserver.observe(this.shell.viewport, { childList: true, subtree: true });
  }

  private instrumentFrames(): void {
    this.shell.viewport.querySelectorAll<HTMLIFrameElement>('iframe').forEach((frame) => {
      if (!this.frameLoadHandlers.has(frame)) {
        const loadHandler: EventListener = () => this.installDocumentBridge(frame);
        frame.addEventListener('load', loadHandler);
        this.frameLoadHandlers.set(frame, loadHandler);
      }
      this.installDocumentBridge(frame);
    });
  }

  private installDocumentBridge(frame: HTMLIFrameElement): void {
    let document: Document | null = null;
    try {
      document = frame.contentDocument;
    } catch {
      return;
    }
    if (!document || this.instrumentedDocuments.has(document)) return;

    this.instrumentedDocuments.add(document);
    this.frameByDocument.set(document, frame);
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.addEventListener('pointerup', this.handleDocumentPointerUp, true);
    document.addEventListener('pointercancel', this.handleDocumentPointerCancel, true);
    document.addEventListener('click', this.handleDocumentClick, true);
  }

  private removeDocumentBridge(document: Document): void {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.removeEventListener('pointerup', this.handleDocumentPointerUp, true);
    document.removeEventListener('pointercancel', this.handleDocumentPointerCancel, true);
    document.removeEventListener('click', this.handleDocumentClick, true);
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    const document = event.currentTarget as Document | null;
    if (!document || event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0) return;
    if (this.shell.root.dataset.readerFlow !== 'paginated') return;
    if (isInteractiveTarget(event.target) || hasSelection(document)) return;

    this.pointerStartByDocument.set(document, {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    });

    // Capture ordinary desktop mouse gestures before the iframe-local EPUB.js pointer listener.
    // Default browser behavior is deliberately preserved so text drag-selection still works.
    event.stopImmediatePropagation();
  };

  private readonly handleDocumentPointerUp = (event: PointerEvent) => {
    const document = event.currentTarget as Document | null;
    if (!document || event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0) return;
    const start = this.pointerStartByDocument.get(document);
    this.pointerStartByDocument.delete(document);
    if (!start) return;

    const elapsed = performance.now() - start.time;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (elapsed > MAX_MOUSE_TAP_MS || distance > MAX_MOUSE_TAP_DISTANCE_PX) return;
    if (isInteractiveTarget(event.target) || hasSelection(document)) return;

    const ratio = this.visibleXRatio(document, event.clientX);
    if (ratio === null || !this.handleVisibleMouseTap(ratio)) return;

    this.lastHandledMouseTap = {
      document,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handleDocumentPointerCancel = (event: PointerEvent) => {
    const document = event.currentTarget as Document | null;
    if (document) this.pointerStartByDocument.delete(document);
  };

  private readonly handleDocumentClick = (event: MouseEvent) => {
    const document = event.currentTarget as Document | null;
    const handled = this.lastHandledMouseTap;
    if (!document || !handled || handled.document !== document) return;

    const elapsed = performance.now() - handled.time;
    const distance = Math.hypot(event.clientX - handled.x, event.clientY - handled.y);
    if (elapsed > COMPATIBILITY_CLICK_WINDOW_MS || distance > COMPATIBILITY_CLICK_DISTANCE_PX) return;

    this.lastHandledMouseTap = undefined;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private visibleXRatio(document: Document, clientX: number): number | null {
    const frame = this.frameByDocument.get(document);
    if (!frame) return null;

    const frameRect = frame.getBoundingClientRect();
    const viewportRect = this.shell.viewport.getBoundingClientRect();
    const visibleLeft = Math.max(frameRect.left, viewportRect.left);
    const visibleRight = Math.min(frameRect.right, viewportRect.right);
    const visibleWidth = visibleRight - visibleLeft;
    if (!Number.isFinite(visibleWidth) || visibleWidth <= 0) return null;

    // Standards-compliant subframe coordinates are relative to the complete iframe viewport.
    // Converting through the frame rect correctly handles EPUB.js shifting a 2080px iframe left
    // while a 1040px slice remains visible.
    const parentX = frameRect.left + clientX;
    if (
      parentX >= visibleLeft - GEOMETRY_TOLERANCE_PX
      && parentX <= visibleRight + GEOMETRY_TOLERANCE_PX
    ) {
      return clampRatio((parentX - visibleLeft) / visibleWidth);
    }

    // Firefox can expose the pointer coordinate relative to the clipped visible slice instead.
    // Accept that coordinate space only when the frame-space conversion lands outside the slice.
    if (clientX >= -GEOMETRY_TOLERANCE_PX && clientX <= visibleWidth + GEOMETRY_TOLERANCE_PX) {
      return clampRatio(clientX / visibleWidth);
    }

    return null;
  }

  private handleVisibleMouseTap(ratio: number): boolean {
    if (this.shell.root.dataset.readerFlow !== 'paginated') return false;
    if (ratio < EDGE_RATIO) {
      void this.navigation.navigate('previous', 'tap');
      return true;
    }
    if (ratio > 1 - EDGE_RATIO) {
      void this.navigation.navigate('next', 'tap');
      return true;
    }
    this.shell.toggleControls();
    return true;
  }

  private applyState(state: ReaderNavigationState): void {
    const paginated = state.flow === 'paginated';
    this.previous.hidden = !paginated;
    this.next.hidden = !paginated;
    this.previous.disabled = !paginated || !state.previous;
    this.next.disabled = !paginated || !state.next;
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader page rail controller has been destroyed.');
  }
}
