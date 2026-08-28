export type PdfDeviceOrientation = 'portrait' | 'landscape';

export interface PdfDeviceState {
  phone: boolean;
  compact: boolean;
  touch: boolean;
  orientation: PdfDeviceOrientation;
  viewportWidth: number;
  viewportHeight: number;
  keyboardOpen: boolean;
  keyboardHeight: number;
}

export interface PdfDeviceMetrics {
  viewportWidth: number;
  viewportHeight: number;
  layoutHeight: number;
  baselineHeight: number;
  focusedEditable: boolean;
  touch: boolean;
  resetBaseline?: boolean;
  phoneBreakpoint?: number;
  compactHeight?: number;
  keyboardThreshold?: number;
}

export interface PdfDeviceResolution {
  state: PdfDeviceState;
  baselineHeight: number;
}

export interface PdfDeviceOptions {
  phoneBreakpoint?: number;
  compactHeight?: number;
  keyboardThreshold?: number;
  resizeDebounceMs?: number;
}

export const PDF_DEVICE_DEFAULTS = {
  phoneBreakpoint: 760,
  compactHeight: 540,
  keyboardThreshold: 120,
  resizeDebounceMs: 80,
} as const;

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';

function positive(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : Math.max(1, Math.round(fallback));
}

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value ?? fallback)));
}

function orientationFor(width: number, height: number): PdfDeviceOrientation {
  return width > height ? 'landscape' : 'portrait';
}

function editableWithin(root: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  try {
    return active.matches(EDITABLE_SELECTOR) ? active : active.closest<HTMLElement>(EDITABLE_SELECTOR);
  } catch {
    return null;
  }
}

export function resolvePdfDeviceState(metrics: PdfDeviceMetrics): PdfDeviceResolution {
  const width = positive(metrics.viewportWidth);
  const height = positive(metrics.viewportHeight);
  const layoutHeight = Math.max(height, positive(metrics.layoutHeight, height));
  const phoneBreakpoint = bounded(metrics.phoneBreakpoint, PDF_DEVICE_DEFAULTS.phoneBreakpoint, 480, 900);
  const compactHeight = bounded(metrics.compactHeight, PDF_DEVICE_DEFAULTS.compactHeight, 360, 720);
  const keyboardThreshold = bounded(metrics.keyboardThreshold, PDF_DEVICE_DEFAULTS.keyboardThreshold, 80, 260);
  const orientation = orientationFor(width, height);

  let baselineHeight = metrics.resetBaseline
    ? Math.max(height, layoutHeight)
    : Math.max(height, positive(metrics.baselineHeight, height));
  if (!metrics.focusedEditable) baselineHeight = Math.max(baselineHeight, height);

  const layoutGap = Math.max(0, layoutHeight - height);
  const baselineGap = Math.max(0, baselineHeight - height);
  const keyboardHeight = Math.round(Math.max(layoutGap, baselineGap));
  const phone = width <= phoneBreakpoint;
  const keyboardOpen = Boolean(phone && metrics.focusedEditable && keyboardHeight >= keyboardThreshold);

  return {
    baselineHeight,
    state: {
      phone,
      compact: height <= compactHeight || (orientation === 'landscape' && height <= 620),
      touch: metrics.touch,
      orientation,
      viewportWidth: width,
      viewportHeight: height,
      keyboardOpen,
      keyboardHeight: keyboardOpen ? keyboardHeight : 0,
    },
  };
}

export class PdfDeviceController {
  private readonly root: HTMLElement;
  private readonly phoneBreakpoint: number;
  private readonly compactHeight: number;
  private readonly keyboardThreshold: number;
  private readonly resizeDebounceMs: number;
  private readonly coarsePointer = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : undefined;
  private readonly visualViewport = typeof window !== 'undefined' ? window.visualViewport : null;
  private baselineHeight = 0;
  private lastOrientation: PdfDeviceOrientation = 'portrait';
  private refreshTimer: number | null = null;
  private resetBaselineOnRefresh = false;
  private started = false;
  private destroyed = false;

  constructor(root: HTMLElement, options: PdfDeviceOptions = {}) {
    this.root = root;
    this.phoneBreakpoint = bounded(options.phoneBreakpoint, PDF_DEVICE_DEFAULTS.phoneBreakpoint, 480, 900);
    this.compactHeight = bounded(options.compactHeight, PDF_DEVICE_DEFAULTS.compactHeight, 360, 720);
    this.keyboardThreshold = bounded(options.keyboardThreshold, PDF_DEVICE_DEFAULTS.keyboardThreshold, 80, 260);
    this.resizeDebounceMs = bounded(options.resizeDebounceMs, PDF_DEVICE_DEFAULTS.resizeDebounceMs, 40, 240);

    const width = positive(this.visualViewport?.width ?? window.innerWidth);
    const height = positive(this.visualViewport?.height ?? window.innerHeight);
    this.lastOrientation = orientationFor(width, height);
    this.baselineHeight = height;
    this.apply(this.resolve(false));
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

  refresh(resetBaseline = false): PdfDeviceState {
    this.assertUsable();
    const state = this.resolve(resetBaseline);
    this.apply(state);
    const focused = editableWithin(this.root);
    if (state.keyboardOpen && focused) this.keepFocusedControlVisible(focused);
    return { ...state };
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
    this.root.removeAttribute('data-pdf-phone');
    this.root.removeAttribute('data-pdf-compact');
    this.root.removeAttribute('data-pdf-orientation');
    this.root.removeAttribute('data-pdf-keyboard');
    this.root.removeAttribute('data-pdf-touch');
    this.root.style.removeProperty('--pdf-visual-height');
    this.root.style.removeProperty('--pdf-visual-width');
    this.root.style.removeProperty('--pdf-keyboard-height');
  }

  private resolve(resetBaseline: boolean): PdfDeviceState {
    const width = positive(this.visualViewport?.width ?? window.innerWidth);
    const height = positive(this.visualViewport?.height ?? window.innerHeight);
    const orientation = orientationFor(width, height);
    const focusedEditable = Boolean(editableWithin(this.root));
    const orientationChanged = orientation !== this.lastOrientation;
    const layoutHeight = positive(Math.max(
      document.documentElement.clientHeight || 0,
      window.innerHeight || 0,
      height,
    ));
    const resolution = resolvePdfDeviceState({
      viewportWidth: width,
      viewportHeight: height,
      layoutHeight,
      baselineHeight: this.baselineHeight,
      focusedEditable,
      touch: Boolean(this.coarsePointer?.matches || navigator.maxTouchPoints > 0),
      resetBaseline: resetBaseline || orientationChanged,
      phoneBreakpoint: this.phoneBreakpoint,
      compactHeight: this.compactHeight,
      keyboardThreshold: this.keyboardThreshold,
    });
    this.baselineHeight = resolution.baselineHeight;
    this.lastOrientation = resolution.state.orientation;
    return resolution.state;
  }

  private apply(state: PdfDeviceState): void {
    this.root.dataset.pdfPhone = String(state.phone);
    this.root.dataset.pdfCompact = String(state.compact);
    this.root.dataset.pdfOrientation = state.orientation;
    this.root.dataset.pdfKeyboard = state.keyboardOpen ? 'open' : 'closed';
    this.root.dataset.pdfTouch = String(state.touch);
    this.root.style.setProperty('--pdf-visual-height', `${state.viewportHeight}px`);
    this.root.style.setProperty('--pdf-visual-width', `${state.viewportWidth}px`);
    this.root.style.setProperty('--pdf-keyboard-height', `${state.keyboardHeight}px`);
  }

  private keepFocusedControlVisible(target: HTMLElement): void {
    requestAnimationFrame(() => {
      if (this.destroyed || !this.root.contains(target)) return;
      try {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      } catch {
        target.scrollIntoView(false);
      }
    });
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

  private assertUsable(): void {
    if (this.destroyed) throw new Error('PDF device controller has been destroyed.');
  }
}
