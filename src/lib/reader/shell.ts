import type { Unsubscribe } from './types';

export type ReaderShellStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ReaderShellCommand = 'previous' | 'next' | 'contents' | 'appearance' | 'more' | 'retry';

export interface ReaderNavigationAvailability {
  previous: boolean;
  next: boolean;
}

export interface ReaderProgressDisplay {
  label: string;
  percentage?: number;
}

type CommandListener = (command: ReaderShellCommand) => void;

const mountedShells = new WeakMap<HTMLElement, ReaderShellController>();

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Reader shell is missing required element: ${selector}`);
  return element;
}

export class ReaderShellController {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;

  private readonly topbar: HTMLElement;
  private readonly bottombar: HTMLElement;
  private readonly title: HTMLElement;
  private readonly chapter: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly loadingMessage: HTMLElement;
  private readonly errorMessage: HTMLElement;
  private readonly announcer: HTMLElement;
  private readonly commandListeners = new Set<CommandListener>();
  private hideTimer: number | null = null;
  private autoHide = false;
  private autoHideDelay = 3600;
  private destroyed = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.viewport = requireElement(root, '[data-reader-viewport]');
    this.topbar = requireElement(root, '[data-reader-topbar]');
    this.bottombar = requireElement(root, '[data-reader-bottombar]');
    this.title = requireElement(root, '[data-reader-title]');
    this.chapter = requireElement(root, '[data-reader-chapter]');
    this.progress = requireElement(root, '[data-reader-progress]');
    this.loadingMessage = requireElement(root, '[data-reader-loading-message]');
    this.errorMessage = requireElement(root, '[data-reader-error-message]');
    this.announcer = requireElement(root, '[data-reader-announcer]');

    root.addEventListener('click', this.handleClick);
    root.addEventListener('pointermove', this.handleActivity, { passive: true });
    root.addEventListener('focusin', this.handleActivity);
    root.addEventListener('reader-shell:toggle-controls', this.handleToggleControls as EventListener);
    document.addEventListener('keydown', this.handleKeydown);

    this.setControlsVisible(true);
    this.setStatus((root.dataset.readerStatus as ReaderShellStatus | undefined) ?? 'idle');
  }

  setStatus(status: ReaderShellStatus, message?: string): void {
    this.assertUsable();
    this.root.dataset.readerStatus = status;
    this.viewport.setAttribute('aria-busy', status === 'loading' ? 'true' : 'false');

    const errorState = this.root.querySelector<HTMLElement>('[data-reader-error]');
    if (errorState) errorState.hidden = status !== 'error';
    if (status === 'loading' && message) this.loadingMessage.textContent = message;
    if (status === 'error' && message) this.errorMessage.textContent = message;

    const contents = this.root.querySelector<HTMLButtonElement>('[data-reader-command="contents"]');
    if (contents) contents.disabled = status !== 'ready';
    if (status !== 'ready') this.setNavigationAvailability({ previous: false, next: false });

    if (status === 'ready') this.scheduleAutoHide();
    else this.clearAutoHide();
  }

  setBookTitle(title: string): void {
    this.assertUsable();
    this.title.textContent = title;
  }

  setChapter(label: string): void {
    this.assertUsable();
    this.chapter.textContent = label || 'Beginning';
  }

  setProgress(display: ReaderProgressDisplay): void {
    this.assertUsable();
    this.progress.textContent = display.label;
    if (display.percentage !== undefined) {
      const percentage = Math.min(1, Math.max(0, display.percentage));
      this.progress.setAttribute('data-percentage', String(percentage));
    } else {
      this.progress.removeAttribute('data-percentage');
    }
  }

  setNavigationAvailability(availability: ReaderNavigationAvailability): void {
    this.assertUsable();
    const previous = this.root.querySelector<HTMLButtonElement>('[data-reader-command="previous"]');
    const next = this.root.querySelector<HTMLButtonElement>('[data-reader-command="next"]');
    if (previous) previous.disabled = !availability.previous;
    if (next) next.disabled = !availability.next;
  }

  setControlsVisible(visible: boolean): void {
    this.assertUsable();
    this.root.dataset.readerControls = visible ? 'visible' : 'hidden';
    for (const bar of [this.topbar, this.bottombar]) {
      bar.setAttribute('aria-hidden', visible ? 'false' : 'true');
      bar.toggleAttribute('inert', !visible);
    }
    if (visible) this.scheduleAutoHide();
    else this.clearAutoHide();
  }

  showControls(): void { this.setControlsVisible(true); }
  hideControls(): void { this.setControlsVisible(false); }

  toggleControls(): void {
    const hidden = this.root.dataset.readerControls === 'hidden';
    this.setControlsVisible(hidden);
  }

  setAutoHide(enabled: boolean, delay = 3600): void {
    this.assertUsable();
    this.autoHide = enabled;
    this.autoHideDelay = Math.max(1200, delay);
    if (enabled) this.scheduleAutoHide();
    else this.clearAutoHide();
  }

  announce(message: string): void {
    this.assertUsable();
    this.announcer.textContent = '';
    window.setTimeout(() => {
      if (!this.destroyed) this.announcer.textContent = message;
    }, 20);
  }

  onCommand(listener: CommandListener): Unsubscribe {
    this.assertUsable();
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearAutoHide();
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('pointermove', this.handleActivity);
    this.root.removeEventListener('focusin', this.handleActivity);
    this.root.removeEventListener('reader-shell:toggle-controls', this.handleToggleControls as EventListener);
    document.removeEventListener('keydown', this.handleKeydown);
    this.commandListeners.clear();
    mountedShells.delete(this.root);
  }

  private readonly handleClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-reader-command]') : null;
    if (!target || !this.root.contains(target)) return;
    const command = target.dataset.readerCommand as ReaderShellCommand | undefined;
    if (!command || target.matches(':disabled')) return;
    this.showControls();
    for (const listener of this.commandListeners) listener(command);
  };

  private readonly handleActivity = () => {
    if (this.root.dataset.readerControls === 'hidden') this.showControls();
    else this.scheduleAutoHide();
  };

  private readonly handleToggleControls = () => this.toggleControls();

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.showControls();
  };

  private scheduleAutoHide(): void {
    this.clearAutoHide();
    if (!this.autoHide || this.root.dataset.readerStatus !== 'ready') return;
    if (this.root.matches(':focus-within')) return;
    this.hideTimer = window.setTimeout(() => {
      if (!this.destroyed && !this.root.matches(':focus-within')) this.hideControls();
    }, this.autoHideDelay);
  }

  private clearAutoHide(): void {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader shell controller has been destroyed.');
  }
}

export function mountReaderShell(root: HTMLElement): ReaderShellController {
  const existing = mountedShells.get(root);
  if (existing) return existing;
  const shell = new ReaderShellController(root);
  mountedShells.set(root, shell);
  return shell;
}
