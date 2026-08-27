import type { Unsubscribe } from './types';

export type ReaderLoadPhase = 'idle' | 'shell' | 'loading-module' | 'opening' | 'ready' | 'error';

export interface ReaderPerformanceState {
  phase: ReaderLoadPhase;
  bootStartedAt: number | undefined;
  shellPaintedAt: number | undefined;
  firstReadyAt: number | undefined;
  bootDurationMs: number | undefined;
  longTaskCount: number;
  longTaskTotalMs: number;
}

export interface ReaderIdleTaskOptions {
  delayMs?: number;
  timeoutMs?: number;
  visibleOnly?: boolean;
}

interface IdleDeadlineLike {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

interface IdleCapableWindow {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

interface YieldScheduler {
  yield?: () => Promise<void>;
}

const PERFORMANCE_PREFIX = 'thiepn-reader';

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function safeMark(name: string): void {
  try { performance.mark(`${PERFORMANCE_PREFIX}:${name}`); } catch {}
}

function safeMeasure(name: string, start: string, end: string): void {
  try {
    performance.measure(
      `${PERFORMANCE_PREFIX}:${name}`,
      `${PERFORMANCE_PREFIX}:${start}`,
      `${PERFORMANCE_PREFIX}:${end}`,
    );
  } catch {}
}

function rounded(value: number): string {
  return String(Math.max(0, Math.round(value)));
}

/**
 * Schedule non-critical reader work without competing with first paint/navigation.
 * Hidden documents wait until visible. requestIdleCallback is preferred; a bounded
 * timer fallback guarantees eventual work on browsers without the idle API.
 */
export function scheduleReaderIdleTask(
  task: () => void | Promise<void>,
  options: ReaderIdleTaskOptions = {},
): Unsubscribe {
  const delayMs = Math.max(0, Math.round(options.delayMs ?? 0));
  const timeoutMs = Math.max(250, Math.round(options.timeoutMs ?? 2500));
  const visibleOnly = options.visibleOnly ?? true;
  const win = window as unknown as IdleCapableWindow;
  let cancelled = false;
  let delayHandle: number | undefined;
  let idleHandle: number | undefined;
  let visibilityBound = false;

  const unbindVisibility = () => {
    if (!visibilityBound) return;
    visibilityBound = false;
    document.removeEventListener('visibilitychange', handleVisibility);
  };

  const bindVisibility = () => {
    if (visibilityBound || cancelled) return;
    visibilityBound = true;
    document.addEventListener('visibilitychange', handleVisibility);
  };

  const cancelScheduled = () => {
    if (delayHandle !== undefined) window.clearTimeout(delayHandle);
    delayHandle = undefined;
    if (idleHandle !== undefined && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleHandle);
    idleHandle = undefined;
  };

  const run = () => {
    if (cancelled) return;
    unbindVisibility();
    void Promise.resolve(task()).catch(() => undefined);
  };

  const runWhenVisible = () => {
    if (cancelled) return;
    if (visibleOnly && document.visibilityState === 'hidden') {
      bindVisibility();
      return;
    }
    run();
  };

  const requestIdle = () => {
    if (cancelled) return;
    if (visibleOnly && document.visibilityState === 'hidden') {
      bindVisibility();
      return;
    }

    unbindVisibility();
    if (typeof win.requestIdleCallback === 'function') {
      idleHandle = win.requestIdleCallback(() => {
        idleHandle = undefined;
        runWhenVisible();
      }, { timeout: timeoutMs });
      return;
    }

    // Browsers without requestIdleCallback still get a quiet turn instead of work
    // being injected synchronously into the first reader-ready frame.
    delayHandle = window.setTimeout(() => {
      delayHandle = undefined;
      runWhenVisible();
    }, Math.min(250, timeoutMs));
  };

  const begin = () => {
    if (cancelled) return;
    if (delayMs === 0) requestIdle();
    else {
      delayHandle = window.setTimeout(() => {
        delayHandle = undefined;
        requestIdle();
      }, delayMs);
    }
  };

  function handleVisibility() {
    if (cancelled || document.visibilityState === 'hidden') return;
    requestIdle();
  }

  begin();

  return () => {
    if (cancelled) return;
    cancelled = true;
    cancelScheduled();
    unbindVisibility();
  };
}

/** Cooperative yield used by long in-book operations such as whole-EPUB search. */
export async function yieldReaderMainThread(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const scheduler = (globalThis as typeof globalThis & { scheduler?: YieldScheduler }).scheduler;
  if (typeof scheduler?.yield === 'function') {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Lightweight production telemetry that never sends data off-device. It exposes
 * coarse boot/long-task measurements through data attributes and Performance API
 * marks so browser tests and manual profiling can inspect the live reader.
 */
export class ReaderPerformanceController {
  private readonly root: HTMLElement;
  private observer: MutationObserver | undefined;
  private longTaskObserver: PerformanceObserver | undefined;
  private started = false;
  private destroyed = false;
  private state: ReaderPerformanceState = {
    phase: 'idle',
    bootStartedAt: undefined,
    shellPaintedAt: undefined,
    firstReadyAt: undefined,
    bootDurationMs: undefined,
    longTaskCount: 0,
    longTaskTotalMs: 0,
  };

  constructor(root: HTMLElement) {
    this.root = root;
  }

  get snapshot(): ReaderPerformanceState {
    return { ...this.state };
  }

  start(): void {
    if (this.destroyed || this.started) return;
    this.started = true;
    const bootStartedAt = now();
    this.state = { ...this.state, phase: 'shell', bootStartedAt };
    this.root.dataset.readerLoadPhase = 'shell';
    safeMark('boot-start');

    this.observer = new MutationObserver(() => this.syncReaderStatus());
    this.observer.observe(this.root, { attributes: true, attributeFilter: ['data-reader-status'] });

    try {
      if (typeof PerformanceObserver !== 'undefined'
        && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        this.longTaskObserver = new PerformanceObserver((list) => {
          if (this.destroyed) return;
          const entries = list.getEntries();
          if (!entries.length) return;
          this.state = {
            ...this.state,
            longTaskCount: this.state.longTaskCount + entries.length,
            longTaskTotalMs: this.state.longTaskTotalMs + entries.reduce((sum, entry) => sum + entry.duration, 0),
          };
          this.root.dataset.readerLongTasks = String(this.state.longTaskCount);
          this.root.dataset.readerLongTaskMs = rounded(this.state.longTaskTotalMs);
        });
        this.longTaskObserver.observe({ entryTypes: ['longtask'] });
      }
    } catch {
      this.longTaskObserver = undefined;
    }

    this.syncReaderStatus();
  }

  markShellPainted(): void {
    if (this.destroyed || this.state.shellPaintedAt !== undefined) return;
    const shellPaintedAt = now();
    this.state = { ...this.state, shellPaintedAt };
    this.root.dataset.readerShellPaintMs = this.state.bootStartedAt === undefined
      ? '0'
      : rounded(shellPaintedAt - this.state.bootStartedAt);
    safeMark('shell-painted');
  }

  markModuleLoading(): void {
    this.setPhase('loading-module');
    safeMark('module-load-start');
  }

  markOpening(): void {
    this.setPhase('opening');
    safeMark('publication-open-start');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = undefined;
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = undefined;
  }

  private syncReaderStatus(): void {
    if (this.destroyed) return;
    const status = this.root.dataset.readerStatus;
    if (status === 'ready') {
      if (this.state.firstReadyAt === undefined) {
        const firstReadyAt = now();
        const bootDurationMs = this.state.bootStartedAt === undefined ? undefined : firstReadyAt - this.state.bootStartedAt;
        this.state = { ...this.state, firstReadyAt, bootDurationMs };
        if (bootDurationMs !== undefined) this.root.dataset.readerBootMs = rounded(bootDurationMs);
        safeMark('first-ready');
        safeMeasure('boot', 'boot-start', 'first-ready');
      }
      this.setPhase('ready');
      return;
    }
    if (status === 'error') this.setPhase('error');
    else if (status === 'loading' && this.state.phase !== 'loading-module') this.setPhase('opening');
  }

  private setPhase(phase: ReaderLoadPhase): void {
    if (this.destroyed || this.state.phase === phase) return;
    this.state = { ...this.state, phase };
    this.root.dataset.readerLoadPhase = phase;
  }
}
