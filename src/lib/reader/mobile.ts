import type { ReaderShellController } from './shell';
import type { Unsubscribe } from './types';

export type ReaderMobileOrientation = 'portrait' | 'landscape';
export type ReaderMobileKeyboardState = 'open' | 'closed';

export interface ReaderMobileState {
  phone: boolean;
  compact: boolean;
  touch: boolean;
  orientation: ReaderMobileOrientation;
  viewportWidth: number;
  viewportHeight: number;
  keyboardOpen: boolean;
  keyboardHeight: number;
}

export interface ReaderMobileOptions {
  phoneBreakpoint?: number;
  compactHeight?: number;
  keyboardThreshold?: number;
  resizeDebounceMs?: number;
}

export const READER_MOBILE_DEFAULTS = {
  phoneBreakpoint: 760,
  compactHeight: 540,
  keyboardThreshold: 120,
  resizeDebounceMs: 80,
} as const;

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';

function editableWithin(root: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  try {
    return active.matches(EDITABLE_SELECTOR) ? active : active.closest<HTMLElement>(EDITABLE_SELECTOR);
  } catch {
    return null;
  }
}

function orientationFor(width: number, height: number): ReaderMobileOrientation {
  return width > height ? 'landscape' : 'portrait';
}

function roundedPositive(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

export class ReaderMobileController {
  private readonly shell: ReaderShellController;
  private readonly root: HTMLElement;
  private readonly phoneBreakpoint: number;
  private readonly compactHeight: number;
  private readonly keyboardThreshold: number;
  private readonly resizeDebounceMs: number;
  private readonly listeners = new Set<(state: ReaderMobileState) => void>();
  private readonly coarsePointer = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : undefined;
  private readonly visualViewport = typeof window !== 'undefined' ? window.visualViewport : null;
  private state: ReaderMobileState;
  private baselineHeight = 0;
  private lastOrientation: ReaderMobileOrientation;
  private refreshTimer: number | null = null;
  private resetBaselineOnRefresh = false;
  private started = false;
  private destroyed = false;

  constructor(shell: ReaderShellController, options: ReaderMobileOptions = {}) {
    this.shell = shell;
    this.root = shell.root;
    this.phoneBreakpoint = Math.max(480, Math.min(900, Math.round(options.phoneBreakpoint ?? READER_MOBILE_DEFAULTS.phoneBreakpoint)));
    this.compactHeight = Math.max(360, Math.min(720, Math.round(options.compactHeight ?? READER_MOBILE_DEFAULTS.compactHeight)));
    this.keyboardThreshold = Math.max(80, Math.min(260, Math.round(options.keyboardThreshold ?? READER_MOBILE_DEFAULTS.keyboardThreshold)));
    this.resizeDebounceMs = Math.max(40, Math.min(240, Math.round(options.resizeDebounceMs ?? READER_MOBILE_DEFAULTS.resizeDebounceMs)));

    const width = roundedPositive(this.visualViewport?.width ?? window.innerWidth);
    const height = roundedPositive(this.visualViewport?.height ?? window.innerHeight);
    const orientation = orientationFor(width, height);
    this.lastOrientation = orientation;
    this.baselineHeight = height;
    this.state = {
      phone: width <= this.phoneBreakpoint,
      compact: height <= this.compactHeight,
      touch: Boolean(this.coarsePointer?.matches || navigator.maxTouchPoints > 0),
      orientation,
      viewportWidth: width,
      viewportHeight: height,
      keyboardOpen: false,
      keyboardHeight: 0,
    };
    this.applyState(this.state);
  }

  get snapshot(): ReaderMobileState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;

    window.addEventListener('resize', this.handleViewportChange, { passive: true });
    window.addEventListener('orientationchange', this.handleOrientationChange, { passive: true });
    this.visualViewport?.addEventListener('resize', this.handleViewportChange, { passive: true });
    this.visualViewport?.addEventListener('scroll', this.handleViewportChange, { passive: true });
    this.coarsePointer?.addEventListener('change', this.handleViewportChange);
    this.root.addEventListener('focusin', this.handleFocusChange);
    this.root.addEventListener('focusout', this.handleFocusChange);
    this.scheduleRefresh(true);
  }

  subscribe(listener: (state: ReaderMobileState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  refresh(resetBaseline = false): void {
    this.assertUsable();
    const width = roundedPositive(this.visualViewport?.width ?? window.innerWidth);
    const height = roundedPositive(this.visualViewport?.height ?? window.innerHeight);
    const orientation = orientationFor(width, height);
    const focusedEditable = editableWithin(this.root);
    const orientationChanged = orientation !== this.lastOrientation;

    if (resetBaseline || orientationChanged) this.baselineHeight = height;
    if (!focusedEditable) this.baselineHeight = Math.max(this.baselineHeight, height);
    if (this.baselineHeight <= 0) this.baselineHeight = height;

    const layoutHeight = roundedPositive(Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0, height));
    const viewportGap = Math.max(0, layoutHeight - height);
    const baselineGap = Math.max(0, this.baselineHeight - height);
    const keyboardHeight = Math.round(Math.max(viewportGap, baselineGap));
    const phone = width <= this.phoneBreakpoint;
    const keyboardOpen = Boolean(phone && focusedEditable && keyboardHeight >= this.keyboardThreshold);
    const compact = height <= this.compactHeight || (orientation === 'landscape' && height <= 620);
    const touch = Boolean(this.coarsePointer?.matches || navigator.maxTouchPoints > 0);

    this.lastOrientation = orientation;
    const next: ReaderMobileState = {
      phone,
      compact,
      touch,
      orientation,
      viewportWidth: width,
      viewportHeight: height,
      keyboardOpen,
      keyboardHeight: keyboardOpen ? keyboardHeight : 0,
    };

    const changed = Object.entries(next).some(([key, value]) => this.state[key as keyof ReaderMobileState] !== value);
    this.state = next;
    this.applyState(next);
    if (keyboardOpen && focusedEditable) this.keepFocusedControlVisible(focusedEditable);
    if (changed) this.emit();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    window.removeEventListener('resize', this.handleViewportChange);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    this.visualViewport?.removeEventListener('resize', this.handleViewportChange);
    this.visualViewport?.removeEventListener('scroll', this.handleViewportChange);
    this.coarsePointer?.removeEventListener('change', this.handleViewportChange);
    this.root.removeEventListener('focusin', this.handleFocusChange);
    this.root.removeEventListener('focusout', this.handleFocusChange);
    this.root.removeAttribute('data-reader-mobile');
    this.root.removeAttribute('data-reader-compact');
    this.root.removeAttribute('data-reader-orientation');
    this.root.removeAttribute('data-reader-keyboard');
    this.root.removeAttribute('data-reader-touch');
    this.root.style.removeProperty('--reader-visual-height');
    this.root.style.removeProperty('--reader-visual-width');
    this.root.style.removeProperty('--reader-keyboard-height');
    this.listeners.clear();
  }

  private readonly handleViewportChange = () => this.scheduleRefresh(false);

  private readonly handleOrientationChange = () => this.scheduleRefresh(true);

  private readonly handleFocusChange = () => this.scheduleRefresh(false);

  private scheduleRefresh(resetBaseline: boolean): void {
    if (this.destroyed) return;
    this.resetBaselineOnRefresh ||= resetBaseline;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      const reset = this.resetBaselineOnRefresh;
      this.resetBaselineOnRefresh = false;
      if (!this.destroyed) this.refresh(reset);
    }, this.resizeDebounceMs);
  }

  private applyState(state: ReaderMobileState): void {
    this.root.dataset.readerMobile = String(state.phone);
    this.root.dataset.readerCompact = String(state.compact);
    this.root.dataset.readerOrientation = state.orientation;
    this.root.dataset.readerKeyboard = state.keyboardOpen ? 'open' : 'closed';
    this.root.dataset.readerTouch = String(state.touch);
    this.root.style.setProperty('--reader-visual-height', `${state.viewportHeight}px`);
    this.root.style.setProperty('--reader-visual-width', `${state.viewportWidth}px`);
    this.root.style.setProperty('--reader-keyboard-height', `${state.keyboardHeight}px`);
  }

  private keepFocusedControlVisible(target: HTMLElement): void {
    requestAnimationFrame(() => {
      if (this.destroyed || !this.state.keyboardOpen || !this.root.contains(target)) return;
      try {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      } catch {
        target.scrollIntoView(false);
      }
    });
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader mobile controller has been destroyed.');
  }
}
