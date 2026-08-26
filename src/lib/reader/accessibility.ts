import type { ReaderController, ReaderControllerState } from './controller';
import type { ReaderShellController } from './shell';
import type { ReaderTocItem, Unsubscribe } from './types';

export interface ReaderAccessibilityState {
  reducedMotion: boolean;
  forcedColors: boolean;
  prefersContrast: boolean;
  modalDialog: string | null;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const DIALOG_SELECTOR = '[role="dialog"]:not([hidden])';
const SIDE_PANEL_SELECTOR = '[data-reader-toc-panel], [data-reader-search-panel], [data-reader-bookmarks-panel], [data-reader-annotations-panel]';

function panelKind(panel: HTMLElement): string | null {
  if (panel.matches('[data-reader-toc-panel]')) return 'toc';
  if (panel.matches('[data-reader-search-panel]')) return 'search';
  if (panel.matches('[data-reader-bookmarks-panel]')) return 'bookmarks';
  if (panel.matches('[data-reader-annotations-panel]')) return 'annotations';
  return null;
}

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.closest('[hidden], [inert]')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
}

export function readerDialogIsModal(root: HTMLElement, panel: HTMLElement): boolean {
  if (panel.matches('[data-reader-appearance-panel], [data-reader-mode-panel]')) return false;
  const kind = panelKind(panel);
  if (!kind) return true;
  const dockSide = root.dataset.readerDockSide ?? 'none';
  const openSidePanel = root.dataset.readerOpenSidepanel ?? 'none';
  return !(dockSide !== 'none' && openSidePanel === kind);
}

export function syncReaderDialogModality(root: HTMLElement, panel: HTMLElement): boolean {
  const modal = readerDialogIsModal(root, panel);
  if (modal) panel.setAttribute('aria-modal', 'true');
  else panel.removeAttribute('aria-modal');
  return modal;
}

/** Keeps keyboard focus inside overlay dialogs while allowing P22 docked panels to behave as non-modal sidebars. */
export function trapReaderDialogFocus(panel: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab') return false;
  const focusable = focusableElements(panel);
  if (!focusable.length) {
    event.preventDefault();
    panel.focus({ preventScroll: true });
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!first || !last) return false;

  if (!panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
    return true;
  }
  return false;
}

function normalizeHref(value: string): string {
  let decoded = value.split('#')[0]?.split('?')[0] ?? '';
  try { decoded = decodeURIComponent(decoded); } catch {}
  return decoded.replace(/^\.\//, '').replace(/^\//, '').toLocaleLowerCase();
}

function flattenToc(items: ReaderTocItem[], output: ReaderTocItem[] = []): ReaderTocItem[] {
  for (const item of items) {
    output.push(item);
    flattenToc(item.children, output);
  }
  return output;
}

function chapterLabelFor(state: ReaderControllerState): string {
  const href = state.location?.href;
  if (!href) return 'Book';
  const normalized = normalizeHref(href);
  const flat = flattenToc(state.toc, []);
  const exact = flat.find((item) => normalizeHref(item.href) === normalized);
  if (exact?.label.trim()) return exact.label.trim();
  const suffix = flat.find((item) => {
    const candidate = normalizeHref(item.href);
    return candidate && normalized && (candidate.endsWith(normalized) || normalized.endsWith(candidate));
  });
  return suffix?.label.trim() || `Section ${Math.max(1, (state.location?.index ?? 0) + 1)}`;
}

function safeMatchMedia(query: string): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia(query);
}

export class ReaderAccessibilityController {
  private readonly controller: ReaderController;
  private readonly shell: ReaderShellController;
  private readonly root: HTMLElement;
  private readonly reducedMotionQuery = safeMatchMedia('(prefers-reduced-motion: reduce)');
  private readonly forcedColorsQuery = safeMatchMedia('(forced-colors: active)');
  private readonly contrastQuery = safeMatchMedia('(prefers-contrast: more)');
  private readonly listeners = new Set<(state: ReaderAccessibilityState) => void>();
  private readonly configuredFrames = new WeakSet<HTMLIFrameElement>();
  private cleanups: Unsubscribe[] = [];
  private observer: MutationObserver | undefined;
  private started = false;
  private destroyed = false;
  private appearanceOpen = false;
  private modeOpen = false;
  private lastLocationCfi: string | undefined;
  private state: ReaderAccessibilityState;

  constructor(controller: ReaderController, shell: ReaderShellController) {
    this.controller = controller;
    this.shell = shell;
    this.root = shell.root;
    this.state = {
      reducedMotion: Boolean(this.reducedMotionQuery?.matches),
      forcedColors: Boolean(this.forcedColorsQuery?.matches),
      prefersContrast: Boolean(this.contrastQuery?.matches),
      modalDialog: null,
    };
  }

  get snapshot(): ReaderAccessibilityState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;
    this.configureShellSemantics();
    this.syncRuntime();

    const MutationObserverCtor = (globalThis as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    if (MutationObserverCtor) {
      this.observer = new MutationObserverCtor(() => this.syncRuntime());
      this.observer.observe(this.root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['hidden', 'data-reader-dock-side', 'data-reader-open-sidepanel', 'data-reader-controls'],
      });
    }

    document.addEventListener('keydown', this.handleDocumentKeydown, true);
    this.reducedMotionQuery?.addEventListener('change', this.handleMediaChange);
    this.forcedColorsQuery?.addEventListener('change', this.handleMediaChange);
    this.contrastQuery?.addEventListener('change', this.handleMediaChange);

    this.cleanups.push(this.controller.subscribe((state) => this.handleReaderState(state)));
    this.cleanups.push(this.controller.onSelection((selection) => {
      if (selection.text.trim()) this.shell.announce('Text selected. Highlight and note actions are available.');
    }));
  }

  subscribe(listener: (state: ReaderAccessibilityState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  refresh(): void {
    this.assertUsable();
    this.syncRuntime();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = undefined;
    document.removeEventListener('keydown', this.handleDocumentKeydown, true);
    this.reducedMotionQuery?.removeEventListener('change', this.handleMediaChange);
    this.forcedColorsQuery?.removeEventListener('change', this.handleMediaChange);
    this.contrastQuery?.removeEventListener('change', this.handleMediaChange);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.listeners.clear();
    delete this.root.dataset.readerAccessibility;
    delete this.root.dataset.readerReducedMotion;
    delete this.root.dataset.readerForcedColors;
    delete this.root.dataset.readerPrefersContrast;
    delete this.root.dataset.readerModalDialog;
  }

  private configureShellSemantics(): void {
    this.root.dataset.readerAccessibility = 'ready';
    this.shell.viewport.setAttribute('role', 'region');
    this.shell.viewport.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight PageUp PageDown Space Shift+Space');

    const previous = this.root.querySelector<HTMLButtonElement>('[data-reader-command="previous"]');
    const next = this.root.querySelector<HTMLButtonElement>('[data-reader-command="next"]');
    previous?.setAttribute('aria-keyshortcuts', 'ArrowLeft PageUp Shift+Space');
    next?.setAttribute('aria-keyshortcuts', 'ArrowRight PageDown Space');

    const identity = this.root.querySelector<HTMLElement>('.reader-shell__identity');
    const location = this.root.querySelector<HTMLElement>('.reader-shell__location');
    identity?.removeAttribute('aria-live');
    location?.removeAttribute('aria-live');

    const announcer = this.root.querySelector<HTMLElement>('[data-reader-announcer]');
    announcer?.setAttribute('role', 'status');
    announcer?.setAttribute('aria-live', 'polite');
    announcer?.setAttribute('aria-atomic', 'true');

    for (const panel of this.shellPopovers()) {
      panel.setAttribute('role', 'dialog');
      panel.removeAttribute('aria-modal');
      panel.tabIndex = -1;
    }
  }

  private syncRuntime(): void {
    this.syncMediaState();
    this.syncDialogs();
    this.syncShellPopovers();
    this.syncHiddenControlFocus();
    this.syncFrames();
  }

  private syncMediaState(): void {
    const next = {
      ...this.state,
      reducedMotion: Boolean(this.reducedMotionQuery?.matches),
      forcedColors: Boolean(this.forcedColorsQuery?.matches),
      prefersContrast: Boolean(this.contrastQuery?.matches),
    };
    this.root.dataset.readerReducedMotion = String(next.reducedMotion);
    this.root.dataset.readerForcedColors = String(next.forcedColors);
    this.root.dataset.readerPrefersContrast = String(next.prefersContrast);
    this.setState(next);
  }

  private syncDialogs(): void {
    const dialogs = [...this.root.querySelectorAll<HTMLElement>('[role="dialog"]')];
    let modalDialog: string | null = null;
    for (const panel of dialogs) {
      if (panel.hidden) {
        panel.removeAttribute('aria-modal');
        continue;
      }
      const modal = syncReaderDialogModality(this.root, panel);
      if (modal) modalDialog = panel.id || panelKind(panel) || 'reader-dialog';
    }
    if (modalDialog) this.root.dataset.readerModalDialog = modalDialog;
    else delete this.root.dataset.readerModalDialog;
    this.setState({ ...this.state, modalDialog });
  }

  private shellPopovers(): HTMLElement[] {
    return [
      this.root.querySelector<HTMLElement>('[data-reader-appearance-panel]'),
      this.root.querySelector<HTMLElement>('[data-reader-mode-panel]'),
    ].filter((panel): panel is HTMLElement => Boolean(panel));
  }

  private syncShellPopovers(): void {
    const appearance = this.root.querySelector<HTMLElement>('[data-reader-appearance-panel]');
    const mode = this.root.querySelector<HTMLElement>('[data-reader-mode-panel]');
    const appearanceNow = Boolean(appearance && !appearance.hidden);
    const modeNow = Boolean(mode && !mode.hidden);

    if (appearance) {
      appearance.setAttribute('role', 'dialog');
      appearance.removeAttribute('aria-modal');
      appearance.tabIndex = -1;
      if (appearanceNow && !this.appearanceOpen) queueMicrotask(() => !appearance.hidden && appearance.focus({ preventScroll: true }));
    }
    if (mode) {
      mode.setAttribute('role', 'dialog');
      mode.removeAttribute('aria-modal');
      mode.tabIndex = -1;
      if (modeNow && !this.modeOpen) queueMicrotask(() => !mode.hidden && mode.focus({ preventScroll: true }));
    }

    const active = document.activeElement;
    if (this.appearanceOpen && !appearanceNow && appearance?.contains(active)) this.recoverFocus('[data-reader-command="appearance"]');
    if (this.modeOpen && !modeNow && mode?.contains(active)) this.recoverFocus('[data-reader-command="more"]');
    this.appearanceOpen = appearanceNow;
    this.modeOpen = modeNow;
  }

  private recoverFocus(triggerSelector: string): void {
    const trigger = this.root.querySelector<HTMLButtonElement>(triggerSelector);
    if (this.root.dataset.readerStatus === 'ready' && trigger && !trigger.disabled) trigger.focus({ preventScroll: true });
    else this.shell.viewport.focus({ preventScroll: true });
  }

  private syncHiddenControlFocus(): void {
    if (this.root.dataset.readerControls !== 'hidden') return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const topbar = this.root.querySelector<HTMLElement>('[data-reader-topbar]');
    const bottombar = this.root.querySelector<HTMLElement>('[data-reader-bottombar]');
    if (topbar?.contains(active) || bottombar?.contains(active)) this.shell.viewport.focus({ preventScroll: true });
  }

  private syncFrames(): void {
    for (const frame of this.shell.viewport.querySelectorAll<HTMLIFrameElement>('iframe')) {
      if (!this.configuredFrames.has(frame)) {
        this.configuredFrames.add(frame);
        frame.addEventListener('load', () => this.configureFrame(frame));
      }
      this.configureFrame(frame);
    }
  }

  private configureFrame(frame: HTMLIFrameElement): void {
    const title = this.root.querySelector<HTMLElement>('[data-reader-title]')?.textContent?.trim();
    frame.title = title ? `Book content: ${title}` : 'Book content';
    try {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      const xmlLang = doc.documentElement.getAttribute('xml:lang');
      if (!doc.documentElement.lang && xmlLang) doc.documentElement.lang = xmlLang;
      if (doc.head && !doc.head.querySelector('[data-reader-a11y-style]')) {
        const style = doc.createElement('style');
        style.dataset.readerA11yStyle = '';
        style.textContent = `
          :focus { outline: 3px solid currentColor !important; outline-offset: 3px !important; }
          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              scroll-behavior: auto !important;
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
          @media (forced-colors: active) {
            :focus { outline: 3px solid Highlight !important; outline-offset: 3px !important; }
          }
        `;
        doc.head.append(style);
      }
    } catch {
      // Reader publications are expected to be same-origin. Failure to inspect a frame must not block reading.
    }
  }

  private handleReaderState(state: ReaderControllerState): void {
    const cfi = state.location?.cfi;
    if (!cfi) {
      this.lastLocationCfi = undefined;
      return;
    }
    if (this.lastLocationCfi && this.lastLocationCfi !== cfi && this.isReadingFocusContext()) {
      const label = chapterLabelFor(state);
      const percentage = state.location?.percentage;
      const progress = percentage === undefined ? '' : `, ${Math.round(Math.max(0, Math.min(1, percentage)) * 100)} percent`;
      this.shell.announce(`${label}${progress}`);
    }
    this.lastLocationCfi = cfi;
  }

  private isReadingFocusContext(): boolean {
    const active = document.activeElement;
    if (!(active instanceof Element)) return false;
    if (active === this.shell.viewport || this.shell.viewport.contains(active)) return true;
    return Boolean(active.closest('[data-reader-command="previous"], [data-reader-command="next"]'));
  }

  private readonly handleMediaChange = () => this.syncRuntime();

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (this.destroyed) return;

    if (event.key === 'Escape') {
      const appearance = this.root.querySelector<HTMLElement>('[data-reader-appearance-panel]:not([hidden])');
      if (appearance) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.shell.setAppearancePanelOpen(false);
        this.root.querySelector<HTMLButtonElement>('[data-reader-command="appearance"]')?.focus({ preventScroll: true });
        return;
      }
      const mode = this.root.querySelector<HTMLElement>('[data-reader-mode-panel]:not([hidden])');
      if (mode) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.shell.setModePanelOpen(false);
        this.root.querySelector<HTMLButtonElement>('[data-reader-command="more"]')?.focus({ preventScroll: true });
        return;
      }
    }

    if (event.key !== 'Tab') return;
    const visibleDialogs = [...this.root.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)];
    if (!visibleDialogs.length) return;
    const target = event.target instanceof Node ? event.target : null;
    const panel = visibleDialogs.find((dialog) => target && dialog.contains(target)) ?? visibleDialogs.at(-1);
    if (!panel) return;

    if (readerDialogIsModal(this.root, panel)) {
      trapReaderDialogFocus(panel, event);
      event.stopImmediatePropagation();
      return;
    }

    // P13's TOC owns an older modal focus loop. Suppress it when P22 has converted the TOC to a docked, non-modal sidebar.
    if (panel.matches('[data-reader-toc-panel]')) event.stopImmediatePropagation();
  };

  private setState(next: ReaderAccessibilityState): void {
    const changed = next.reducedMotion !== this.state.reducedMotion
      || next.forcedColors !== this.state.forcedColors
      || next.prefersContrast !== this.state.prefersContrast
      || next.modalDialog !== this.state.modalDialog;
    this.state = next;
    if (!changed) return;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader accessibility controller has been destroyed.');
  }
}
