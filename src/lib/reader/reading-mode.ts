import { ReaderController } from './controller';
import type { ReaderFlow, ReaderSpread, Unsubscribe } from './types';

export type ReaderOrientation = 'portrait' | 'landscape';

export interface ReaderReadingModeState {
  flow: ReaderFlow;
  spreadPreference: ReaderSpread;
  effectiveSpread: Exclude<ReaderSpread, 'auto'>;
  viewportWidth: number;
  viewportHeight: number;
  orientation: ReaderOrientation;
}

export interface ReaderReadingModeOptions {
  flow?: ReaderFlow;
  spread?: ReaderSpread;
  minSpreadWidth?: number;
  resizeDebounceMs?: number;
}

const DEFAULT_MIN_SPREAD_WIDTH = 900;
const DEFAULT_RESIZE_DEBOUNCE_MS = 140;

export class ReaderReadingModeController {
  private readonly controller: ReaderController;
  private readonly viewport: HTMLElement;
  private readonly minSpreadWidth: number;
  private readonly resizeDebounceMs: number;
  private readonly listeners = new Set<(state: ReaderReadingModeState) => void>();
  private resizeObserver: ResizeObserver | undefined;
  private resizeTimer: number | undefined;
  private started = false;
  private destroyed = false;
  private queue: Promise<void> = Promise.resolve();
  private state: ReaderReadingModeState;

  constructor(controller: ReaderController, viewport: HTMLElement, options: ReaderReadingModeOptions = {}) {
    this.controller = controller;
    this.viewport = viewport;
    this.minSpreadWidth = Math.max(600, options.minSpreadWidth ?? DEFAULT_MIN_SPREAD_WIDTH);
    this.resizeDebounceMs = Math.max(60, options.resizeDebounceMs ?? DEFAULT_RESIZE_DEBOUNCE_MS);
    const { width, height } = this.readViewport();
    const flow = options.flow ?? 'paginated';
    const spreadPreference = options.spread ?? 'auto';
    this.state = {
      flow,
      spreadPreference,
      effectiveSpread: this.resolveEffectiveSpread(flow, spreadPreference, width),
      viewportWidth: width,
      viewportHeight: height,
      orientation: this.resolveOrientation(width, height),
    };
  }

  get snapshot(): ReaderReadingModeState {
    return { ...this.state };
  }

  async start(): Promise<void> {
    this.assertUsable();
    if (!this.started) {
      this.started = true;
      this.attachResizeMonitoring();
    }
    await this.refreshViewport(true);
  }

  async reapply(): Promise<void> {
    this.assertUsable();
    await this.refreshViewport(true);
  }

  async setFlow(flow: ReaderFlow): Promise<void> {
    this.assertUsable();
    if (this.state.flow === flow) return;
    this.state = { ...this.state, flow };
    await this.applyLayout();
  }

  async setSpreadPreference(spread: ReaderSpread): Promise<void> {
    this.assertUsable();
    if (this.state.spreadPreference === spread) return;
    this.state = { ...this.state, spreadPreference: spread };
    await this.applyLayout();
  }

  subscribe(listener: (state: ReaderReadingModeState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.resizeTimer !== undefined) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('orientationchange', this.handleWindowResize);
    this.listeners.clear();
  }

  private attachResizeMonitoring(): void {
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.scheduleViewportRefresh());
      this.resizeObserver.observe(this.viewport);
    } else {
      window.addEventListener('resize', this.handleWindowResize, { passive: true });
    }
    window.addEventListener('orientationchange', this.handleWindowResize, { passive: true });
  }

  private readonly handleWindowResize = () => this.scheduleViewportRefresh();

  private scheduleViewportRefresh(): void {
    if (this.destroyed) return;
    if (this.resizeTimer !== undefined) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = undefined;
      void this.refreshViewport(false).catch(() => undefined);
    }, this.resizeDebounceMs);
  }

  private async refreshViewport(force: boolean): Promise<void> {
    const { width, height } = this.readViewport();
    const orientation = this.resolveOrientation(width, height);
    const changed = width !== this.state.viewportWidth || height !== this.state.viewportHeight || orientation !== this.state.orientation;
    if (!force && !changed) return;
    this.state = { ...this.state, viewportWidth: width, viewportHeight: height, orientation };
    await this.applyLayout();
  }

  private async applyLayout(): Promise<void> {
    const effectiveSpread = this.resolveEffectiveSpread(this.state.flow, this.state.spreadPreference, this.state.viewportWidth);
    this.state = { ...this.state, effectiveSpread };
    this.emit();

    const task = async () => {
      if (this.destroyed) return;
      await this.controller.updateReadingLayout({
        flow: this.state.flow,
        spread: effectiveSpread,
        minSpreadWidth: this.minSpreadWidth,
        width: this.state.viewportWidth,
        height: this.state.viewportHeight,
        preserveLocation: true,
      });
    };

    const scheduled = this.queue.then(task, task);
    this.queue = scheduled.catch(() => undefined);
    await scheduled;
  }

  private resolveEffectiveSpread(flow: ReaderFlow, preference: ReaderSpread, width: number): Exclude<ReaderSpread, 'auto'> {
    if (flow === 'scrolled') return 'single';
    if (preference === 'single') return 'single';
    if (width < this.minSpreadWidth) return 'single';
    return 'double';
  }

  private readViewport(): { width: number; height: number } {
    const rect = this.viewport.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect.width || this.viewport.clientWidth || 1)),
      height: Math.max(1, Math.round(rect.height || this.viewport.clientHeight || 1)),
    };
  }

  private resolveOrientation(width: number, height: number): ReaderOrientation {
    return width > height ? 'landscape' : 'portrait';
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader reading-mode controller has been destroyed.');
  }
}
