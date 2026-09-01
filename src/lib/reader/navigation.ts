import { ReaderController, type ReaderControllerState } from './controller';
import { ReaderReadingModeController, type ReaderReadingModeState } from './reading-mode';
import { ReaderShellController } from './shell';
import type { ReaderContentInteraction, ReaderFlow, ReaderLocation, Unsubscribe } from './types';

export type ReaderNavigationDirection = 'previous' | 'next';

export interface ReaderNavigationState {
  busy: boolean;
  previous: boolean;
  next: boolean;
  flow: ReaderFlow;
}

export interface ReaderNavigationOptions {
  edgeTapRatio?: number;
  enableSwipe?: boolean;
  enableKeyboard?: boolean;
}

const DEFAULT_EDGE_TAP_RATIO = 1 / 3;
const EDITABLE_SELECTOR = 'input, textarea, select, option, button, a[href], [contenteditable="true"], [role="textbox"]';
const PUBLICATION_INTERACTIVE_SELECTOR = [
  EDITABLE_SELECTOR,
  'label',
  'summary',
  'details',
  'audio',
  'video',
  '[role="button"]',
  '[role="link"]',
  '[data-no-reader-nav]',
].join(',');

function isEditableTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  if (typeof candidate?.closest !== 'function') return false;
  try {
    return Boolean(candidate.closest(EDITABLE_SELECTOR));
  } catch {
    return false;
  }
}

function isPublicationInteractiveTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  if (typeof candidate?.closest !== 'function') return false;
  try {
    return Boolean(candidate.closest(PUBLICATION_INTERACTIVE_SELECTOR));
  } catch {
    return false;
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/**
 * EPUB.js paginated chapters can render one iframe whose viewport spans every column in the
 * current spine section. In that layout an event's xRatio is section-relative, not relative to
 * the one/two pages actually visible to the reader. Classifying that raw ratio directly makes
 * ordinary taps on early pages look like left-edge taps and can repeatedly walk the reader back
 * toward the beginning/cover.
 *
 * `displayedPage`/`displayedTotal` identify the visible slice inside that section-wide iframe.
 * When the raw ratio lies inside that slice, remap it to a visible-spread ratio. If a browser
 * already reports page-local coordinates, the raw ratio normally falls outside the section
 * slice on later pages and is deliberately left unchanged.
 */
function visibleTapRatio(
  rawRatio: number,
  location: ReaderLocation | null,
  spread: ReaderReadingModeState['effectiveSpread'],
): number {
  const raw = clampUnit(rawRatio);
  const page = location?.displayedPage;
  const total = location?.displayedTotal;
  if (
    typeof page !== 'number'
    || typeof total !== 'number'
    || !Number.isFinite(page)
    || !Number.isFinite(total)
    || page <= 0
    || total <= 1
  ) return raw;

  const safePage = Math.max(1, Math.min(total, Math.round(page)));
  const visiblePages = spread === 'double' ? Math.min(2, total - safePage + 1) : 1;
  const sliceStart = (safePage - 1) / total;
  const sliceEnd = (safePage - 1 + visiblePages) / total;
  const tolerance = Math.min(0.025, 0.25 / total);

  // A page-local browser coordinate (for example 0.84 on the right side) must not be remapped
  // merely because the chapter itself contains many pages. Only ratios that plausibly belong to
  // the currently visible section slice are interpreted as section-global coordinates.
  if (raw < sliceStart - tolerance || raw > sliceEnd + tolerance) return raw;

  const sliceWidth = Math.max(Number.EPSILON, sliceEnd - sliceStart);
  return clampUnit((raw - sliceStart) / sliceWidth);
}

function keyboardDirection(
  key: string,
  code: string,
  shiftKey: boolean,
): ReaderNavigationDirection | null {
  if (key === 'ArrowRight' || key === 'PageDown') return 'next';
  if (key === 'ArrowLeft' || key === 'PageUp') return 'previous';
  if (key === ' ' || code === 'Space') return shiftKey ? 'previous' : 'next';
  return null;
}

export class ReaderNavigationController {
  private readonly controller: ReaderController;
  private readonly readingMode: ReaderReadingModeController;
  private readonly shell: ReaderShellController;
  private readonly edgeTapRatio: number;
  private readonly enableSwipe: boolean;
  private readonly enableKeyboard: boolean;
  private readonly listeners = new Set<(state: ReaderNavigationState) => void>();
  private cleanups: Unsubscribe[] = [];
  private iframeBridgeCleanups: Unsubscribe[] = [];
  private bridgedFrames = new WeakSet<HTMLIFrameElement>();
  private bridgedDocuments = new WeakSet<Document>();
  private iframeObserver: MutationObserver | null = null;
  private controllerState: ReaderControllerState;
  private readingModeState: ReaderReadingModeState;
  private state: ReaderNavigationState;
  private started = false;
  private destroyed = false;

  constructor(
    controller: ReaderController,
    readingMode: ReaderReadingModeController,
    shell: ReaderShellController,
    options: ReaderNavigationOptions = {},
  ) {
    this.controller = controller;
    this.readingMode = readingMode;
    this.shell = shell;
    this.edgeTapRatio = Math.min(0.4, Math.max(0.15, options.edgeTapRatio ?? DEFAULT_EDGE_TAP_RATIO));
    this.enableSwipe = options.enableSwipe ?? true;
    this.enableKeyboard = options.enableKeyboard ?? true;
    this.controllerState = controller.snapshot;
    this.readingModeState = readingMode.snapshot;
    this.state = {
      busy: false,
      previous: false,
      next: false,
      flow: this.readingModeState.flow,
    };
  }

  get snapshot(): ReaderNavigationState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    if (this.started) {
      this.refreshAvailability();
      return;
    }
    this.started = true;

    this.cleanups.push(this.controller.subscribe((state) => {
      this.controllerState = state;
      this.refreshAvailability();
    }));
    this.cleanups.push(this.readingMode.subscribe((state) => {
      this.readingModeState = state;
      this.refreshAvailability();
    }));
    this.cleanups.push(this.controller.onInteraction(this.handleContentInteraction));
    this.cleanups.push(this.shell.onCommand((command) => {
      if (command === 'previous') void this.navigate('previous', 'button');
      if (command === 'next') void this.navigate('next', 'button');
    }));

    this.startIframeCompatibilityBridge();
    if (this.enableKeyboard) document.addEventListener('keydown', this.handleDocumentKeydown);
    this.refreshAvailability();
  }

  /** Re-sync control availability after the shell crosses loading/ready without an engine state change. */
  refresh(): void {
    this.assertUsable();
    if (!this.started) return;
    this.refreshAvailability();
    this.scanReaderFrames();
  }

  subscribe(listener: (state: ReaderNavigationState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async navigate(direction: ReaderNavigationDirection, source: 'button' | 'keyboard' | 'tap' | 'swipe' = 'button'): Promise<void> {
    this.assertUsable();
    if (this.state.busy || !this.isInteractiveReady()) return;

    // A reader who deliberately hid the chrome has expressed an immersive-reading preference.
    // EPUB.js may replace/focus an iframe while turning a page, which can transiently trigger
    // shell focus handling and reveal the bars. Preserve the pre-turn hidden state for every
    // non-keyboard navigation path; keyboard navigation intentionally keeps its existing reveal
    // behavior so keyboard users retain visible orientation and controls.
    const preserveHiddenChrome = source !== 'keyboard'
      && this.shell.root.dataset.readerControls === 'hidden';

    const location = this.controllerState.location;
    if (direction === 'previous' && location?.atStart) {
      this.shell.announce('Beginning of book');
      this.refreshAvailability();
      return;
    }
    if (direction === 'next' && location?.atEnd) {
      this.shell.announce('End of book');
      this.refreshAvailability();
      return;
    }

    this.setBusy(true);
    try {
      if (direction === 'previous') await this.controller.previous();
      else await this.controller.next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to move through the book.';
      this.shell.announce(message);
    } finally {
      this.setBusy(false);
      // EPUB.js can replace/reload the active iframe document while crossing section boundaries.
      // Re-scan only after the page turn settles so WebKit always gets a bridge on the current
      // document instead of retaining a listener on the previous section.
      this.scanReaderFrames();
      if (preserveHiddenChrome) this.shell.hideControls();
    }

    if (source === 'keyboard') this.shell.showControls();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.enableKeyboard) document.removeEventListener('keydown', this.handleDocumentKeydown);
    this.iframeObserver?.disconnect();
    this.iframeObserver = null;
    for (const cleanup of this.iframeBridgeCleanups) cleanup();
    this.iframeBridgeCleanups = [];
    this.bridgedFrames = new WeakSet<HTMLIFrameElement>();
    this.bridgedDocuments = new WeakSet<Document>();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.listeners.clear();
  }

  private readonly handleContentInteraction = (interaction: ReaderContentInteraction): boolean => {
    if (this.destroyed || !this.isInteractiveReady()) return false;
    if (interaction.interactive || interaction.hasSelection) return false;

    if (interaction.type === 'key') {
      if (!this.enableKeyboard || this.readingModeState.flow !== 'paginated') return false;
      if (interaction.altKey || interaction.ctrlKey || interaction.metaKey) return false;
      const direction = keyboardDirection(interaction.key, interaction.code, interaction.shiftKey);
      if (!direction) return false;
      void this.navigate(direction, 'keyboard');
      return true;
    }

    if (interaction.type === 'swipe') {
      if (!this.enableSwipe || this.readingModeState.flow !== 'paginated') return false;
      void this.navigate(interaction.direction === 'left' ? 'next' : 'previous', 'swipe');
      return true;
    }

    if (interaction.type === 'tap') return this.handleTapRatio(interaction.xRatio);

    return false;
  };

  private handleTapRatio(rawRatio: number): boolean {
    const tapRatio = visibleTapRatio(
      rawRatio,
      this.controllerState.location,
      this.readingModeState.effectiveSpread,
    );

    if (this.readingModeState.flow === 'paginated') {
      if (tapRatio <= this.edgeTapRatio) {
        void this.navigate('previous', 'tap');
        return true;
      }
      if (tapRatio >= 1 - this.edgeTapRatio) {
        void this.navigate('next', 'tap');
        return true;
      }
    }

    const centerStart = this.edgeTapRatio;
    const centerEnd = 1 - this.edgeTapRatio;
    if (tapRatio > centerStart && tapRatio < centerEnd) {
      this.shell.toggleControls();
      return true;
    }
    return false;
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (this.destroyed || !this.isInteractiveReady() || this.readingModeState.flow !== 'paginated') return;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isEditableTarget(event.target) || this.hasOpenReaderPanel()) return;
    if (window.getSelection()?.toString().trim()) return;

    const direction = keyboardDirection(event.key, event.code, event.shiftKey);
    if (!direction) return;
    event.preventDefault();
    void this.navigate(direction, 'keyboard');
  };

  private startIframeCompatibilityBridge(): void {
    this.scanReaderFrames();
    this.iframeObserver = new MutationObserver(() => this.scanReaderFrames());
    this.iframeObserver.observe(this.shell.viewport, { childList: true, subtree: true });
  }

  private scanReaderFrames(): void {
    if (this.destroyed) return;
    for (const frame of this.shell.viewport.querySelectorAll('iframe')) this.attachFrameBridge(frame);
  }

  private attachFrameBridge(frame: HTMLIFrameElement): void {
    if (!this.bridgedFrames.has(frame)) {
      this.bridgedFrames.add(frame);
      const onLoad = () => {
        // EPUB.js creates Contents and fires its own rendered hooks after iframe load processing.
        // Attach on the following frame so the normal engine listener owns the event first. The
        // bridge then observes event.defaultPrevented and is a no-op whenever that primary path works.
        requestAnimationFrame(() => this.attachDocumentBridge(frame));
      };
      frame.addEventListener('load', onLoad);
      this.iframeBridgeCleanups.push(() => frame.removeEventListener('load', onLoad));
    }
    requestAnimationFrame(() => this.attachDocumentBridge(frame));
  }

  private attachDocumentBridge(frame: HTMLIFrameElement): void {
    if (this.destroyed) return;
    let doc: Document | null = null;
    let win: Window | null = null;
    try {
      doc = frame.contentDocument;
      win = frame.contentWindow;
    } catch {
      return;
    }
    if (!doc || !win || this.bridgedDocuments.has(doc)) return;
    this.bridgedDocuments.add(doc);

    const handleCompatibilityClick = (event: MouseEvent) => {
      // Engine pointer/touch/click listeners remain primary. This parent-owned listener exists for
      // WebKit section transitions where the newly active iframe Document can otherwise lose the
      // normal compatibility-click listener. Never turn twice when the engine already consumed it.
      if (event.defaultPrevented || this.destroyed || !this.isInteractiveReady()) return;
      if (isPublicationInteractiveTarget(event.target)) return;
      if (win?.getSelection()?.toString().trim()) return;

      const width = Math.max(1, win?.innerWidth || doc?.documentElement?.clientWidth || 1);
      if (this.handleTapRatio(event.clientX / width)) event.preventDefault();
    };

    doc.addEventListener('click', handleCompatibilityClick);
    this.iframeBridgeCleanups.push(() => doc?.removeEventListener('click', handleCompatibilityClick));
  }

  private isInteractiveReady(): boolean {
    return this.controllerState.status === 'ready' && this.shell.root.dataset.readerStatus === 'ready';
  }

  private hasOpenReaderPanel(): boolean {
    return Boolean(this.shell.root.querySelector(
      '[data-reader-toc-panel]:not([hidden]), [data-reader-appearance-panel]:not([hidden]), [data-reader-mode-panel]:not([hidden]), [data-reader-search-panel]:not([hidden]), [data-reader-bookmarks-panel]:not([hidden]), [data-reader-annotations-panel]:not([hidden]), [data-reader-selection-actions]:not([hidden])',
    ));
  }

  private refreshAvailability(): void {
    const location = this.controllerState.location;
    const ready = this.isInteractiveReady() && !this.state.busy;
    const previous = ready && !Boolean(location?.atStart);
    const next = ready && !Boolean(location?.atEnd);
    const flow = this.readingModeState.flow;
    const changed = previous !== this.state.previous || next !== this.state.next || flow !== this.state.flow;
    this.state = { ...this.state, previous, next, flow };
    this.shell.setNavigationAvailability({ previous, next });
    if (changed) this.emit();
  }

  private setBusy(busy: boolean): void {
    if (this.state.busy === busy) return;
    this.state = { ...this.state, busy };
    this.refreshAvailability();
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader navigation controller has been destroyed.');
  }
}
