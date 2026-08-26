import type { ReaderShellController } from './shell';
import type { Unsubscribe } from './types';

export type ReaderDesktopSurface = 'phone' | 'tablet' | 'desktop' | 'wide';
export type ReaderDesktopOrientation = 'portrait' | 'landscape';
export type ReaderDesktopPanel = 'none' | 'toc' | 'search' | 'bookmarks' | 'annotations';
export type ReaderDesktopDockSide = 'none' | 'left' | 'right';

export interface ReaderDesktopState {
  surface: ReaderDesktopSurface;
  orientation: ReaderDesktopOrientation;
  viewportWidth: number;
  viewportHeight: number;
  compactHeight: boolean;
  constrainedWidth: boolean;
  hover: boolean;
  finePointer: boolean;
  touchCapable: boolean;
  openPanel: ReaderDesktopPanel;
  dockSide: ReaderDesktopDockSide;
}

export interface ReaderDesktopOptions {
  phoneBreakpoint?: number;
  tabletBreakpoint?: number;
  wideBreakpoint?: number;
  dockBreakpoint?: number;
  compactHeight?: number;
  constrainedWidth?: number;
  resizeDebounceMs?: number;
}

export const READER_DESKTOP_DEFAULTS = {
  phoneBreakpoint: 760,
  tabletBreakpoint: 1180,
  wideBreakpoint: 1560,
  dockBreakpoint: 1440,
  compactHeight: 680,
  constrainedWidth: 980,
  resizeDebounceMs: 100,
} as const;

const PANEL_SELECTORS: Array<[ReaderDesktopPanel, string]> = [
  ['toc', '[data-reader-toc-panel]'],
  ['search', '[data-reader-search-panel]'],
  ['bookmarks', '[data-reader-bookmarks-panel]'],
  ['annotations', '[data-reader-annotations-panel]'],
];

function roundedPositive(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function orientationFor(width: number, height: number): ReaderDesktopOrientation {
  return width > height ? 'landscape' : 'portrait';
}

export class ReaderDesktopController {
  private readonly shell: ReaderShellController;
  private readonly root: HTMLElement;
  private readonly phoneBreakpoint: number;
  private readonly tabletBreakpoint: number;
  private readonly wideBreakpoint: number;
  private readonly dockBreakpoint: number;
  private readonly compactHeight: number;
  private readonly constrainedWidth: number;
  private readonly resizeDebounceMs: number;
  private readonly hoverQuery = typeof matchMedia === 'function' ? matchMedia('(hover: hover)') : undefined;
  private readonly finePointerQuery = typeof matchMedia === 'function' ? matchMedia('(pointer: fine)') : undefined;
  private readonly listeners = new Set<(state: ReaderDesktopState) => void>();
  private resizeObserver: ResizeObserver | undefined;
  private mutationObserver: MutationObserver | undefined;
  private refreshTimer: number | null = null;
  private state: ReaderDesktopState;
  private started = false;
  private destroyed = false;

  constructor(shell: ReaderShellController, options: ReaderDesktopOptions = {}) {
    this.shell = shell;
    this.root = shell.root;
    this.phoneBreakpoint = Math.max(560, Math.min(900, Math.round(options.phoneBreakpoint ?? READER_DESKTOP_DEFAULTS.phoneBreakpoint)));
    this.tabletBreakpoint = Math.max(this.phoneBreakpoint + 80, Math.min(1400, Math.round(options.tabletBreakpoint ?? READER_DESKTOP_DEFAULTS.tabletBreakpoint)));
    this.wideBreakpoint = Math.max(this.tabletBreakpoint + 120, Math.min(2400, Math.round(options.wideBreakpoint ?? READER_DESKTOP_DEFAULTS.wideBreakpoint)));
    this.dockBreakpoint = Math.max(this.tabletBreakpoint, Math.min(this.wideBreakpoint, Math.round(options.dockBreakpoint ?? READER_DESKTOP_DEFAULTS.dockBreakpoint)));
    this.compactHeight = Math.max(480, Math.min(900, Math.round(options.compactHeight ?? READER_DESKTOP_DEFAULTS.compactHeight)));
    this.constrainedWidth = Math.max(this.phoneBreakpoint + 40, Math.min(this.tabletBreakpoint, Math.round(options.constrainedWidth ?? READER_DESKTOP_DEFAULTS.constrainedWidth)));
    this.resizeDebounceMs = Math.max(50, Math.min(240, Math.round(options.resizeDebounceMs ?? READER_DESKTOP_DEFAULTS.resizeDebounceMs)));

    const { width, height } = this.readViewport();
    this.state = this.buildState(width, height);
    this.applyState(this.state);
  }

  get snapshot(): ReaderDesktopState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;

    const ResizeObserverCtor = (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(() => this.scheduleRefresh());
      this.resizeObserver.observe(this.root);
    } else {
      window.addEventListener('resize', this.handleViewportChange, { passive: true });
    }

    const MutationObserverCtor = (globalThis as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    if (MutationObserverCtor) {
      this.mutationObserver = new MutationObserverCtor(() => this.scheduleRefresh());
      this.mutationObserver.observe(this.root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    }

    window.addEventListener('orientationchange', this.handleViewportChange, { passive: true });
    this.hoverQuery?.addEventListener('change', this.handleViewportChange);
    this.finePointerQuery?.addEventListener('change', this.handleViewportChange);
    this.scheduleRefresh();
  }

  subscribe(listener: (state: ReaderDesktopState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  refresh(): void {
    this.assertUsable();
    const { width, height } = this.readViewport();
    const next = this.buildState(width, height);
    const changed = Object.entries(next).some(([key, value]) => this.state[key as keyof ReaderDesktopState] !== value);
    this.state = next;
    this.applyState(next);
    if (changed) this.emit();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.mutationObserver?.disconnect();
    this.mutationObserver = undefined;
    window.removeEventListener('resize', this.handleViewportChange);
    window.removeEventListener('orientationchange', this.handleViewportChange);
    this.hoverQuery?.removeEventListener('change', this.handleViewportChange);
    this.finePointerQuery?.removeEventListener('change', this.handleViewportChange);
    for (const attribute of [
      'data-reader-desktop-surface',
      'data-reader-desktop-orientation',
      'data-reader-window-compact',
      'data-reader-window-constrained',
      'data-reader-hover',
      'data-reader-fine-pointer',
      'data-reader-touch-capable',
      'data-reader-open-sidepanel',
      'data-reader-dock-side',
    ]) this.root.removeAttribute(attribute);
    this.root.style.removeProperty('--reader-desktop-width');
    this.root.style.removeProperty('--reader-desktop-height');
    this.listeners.clear();
  }

  private readonly handleViewportChange = () => this.scheduleRefresh();

  private scheduleRefresh(): void {
    if (this.destroyed) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      if (!this.destroyed) this.refresh();
    }, this.resizeDebounceMs);
  }

  private buildState(width: number, height: number): ReaderDesktopState {
    const surface = this.resolveSurface(width);
    const compactHeight = height <= this.compactHeight;
    const openPanel = this.findOpenPanel();
    const dockEligible = width >= this.dockBreakpoint && !compactHeight && surface !== 'phone' && surface !== 'tablet';
    const dockSide: ReaderDesktopDockSide = dockEligible
      ? openPanel === 'toc' ? 'left' : openPanel === 'search' || openPanel === 'bookmarks' || openPanel === 'annotations' ? 'right' : 'none'
      : 'none';

    return {
      surface,
      orientation: orientationFor(width, height),
      viewportWidth: width,
      viewportHeight: height,
      compactHeight,
      constrainedWidth: width <= this.constrainedWidth,
      hover: Boolean(this.hoverQuery?.matches),
      finePointer: Boolean(this.finePointerQuery?.matches),
      touchCapable: navigator.maxTouchPoints > 0,
      openPanel,
      dockSide,
    };
  }

  private resolveSurface(width: number): ReaderDesktopSurface {
    if (width <= this.phoneBreakpoint) return 'phone';
    if (width <= this.tabletBreakpoint) return 'tablet';
    if (width >= this.wideBreakpoint) return 'wide';
    return 'desktop';
  }

  private findOpenPanel(): ReaderDesktopPanel {
    for (const [kind, selector] of PANEL_SELECTORS) {
      const panel = this.root.querySelector<HTMLElement>(selector);
      if (panel && !panel.hidden) return kind;
    }
    return 'none';
  }

  private readViewport(): { width: number; height: number } {
    const rect = this.root.getBoundingClientRect();
    return {
      width: roundedPositive(rect.width || window.innerWidth),
      height: roundedPositive(rect.height || window.innerHeight),
    };
  }

  private applyState(state: ReaderDesktopState): void {
    this.root.dataset.readerDesktopSurface = state.surface;
    this.root.dataset.readerDesktopOrientation = state.orientation;
    this.root.dataset.readerWindowCompact = String(state.compactHeight);
    this.root.dataset.readerWindowConstrained = String(state.constrainedWidth);
    this.root.dataset.readerHover = String(state.hover);
    this.root.dataset.readerFinePointer = String(state.finePointer);
    this.root.dataset.readerTouchCapable = String(state.touchCapable);
    this.root.dataset.readerOpenSidepanel = state.openPanel;
    this.root.dataset.readerDockSide = state.dockSide;
    this.root.style.setProperty('--reader-desktop-width', `${state.viewportWidth}px`);
    this.root.style.setProperty('--reader-desktop-height', `${state.viewportHeight}px`);
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader desktop controller has been destroyed.');
  }
}
