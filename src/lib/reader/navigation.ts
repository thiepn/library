import { ReaderController, type ReaderControllerState } from './controller';
import { ReaderReadingModeController, type ReaderReadingModeState } from './reading-mode';
import { ReaderShellController } from './shell';
import type { ReaderContentInteraction, ReaderFlow, Unsubscribe } from './types';

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

const DEFAULT_EDGE_TAP_RATIO = 0.27;
const EDITABLE_SELECTOR = 'input, textarea, select, option, button, a[href], [contenteditable="true"], [role="textbox"]';

function isEditableTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  if (typeof candidate?.closest !== 'function') return false;
  try {
    return Boolean(candidate.closest(EDITABLE_SELECTOR));
  } catch {
    return false;
  }
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
    if (this.started) return;
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

    if (this.enableKeyboard) document.addEventListener('keydown', this.handleDocumentKeydown);
    this.refreshAvailability();
  }

  subscribe(listener: (state: ReaderNavigationState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async navigate(direction: ReaderNavigationDirection, source: 'button' | 'keyboard' | 'tap' | 'swipe' = 'button'): Promise<void> {
    this.assertUsable();
    if (this.state.busy || this.controllerState.status !== 'ready') return;

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
    }

    if (source === 'keyboard') this.shell.showControls();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.enableKeyboard) document.removeEventListener('keydown', this.handleDocumentKeydown);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.listeners.clear();
  }

  private readonly handleContentInteraction = (interaction: ReaderContentInteraction): boolean => {
    if (this.destroyed || this.controllerState.status !== 'ready') return false;
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

    if (interaction.type === 'tap') {
      if (this.readingModeState.flow === 'paginated') {
        if (interaction.xRatio <= this.edgeTapRatio) {
          void this.navigate('previous', 'tap');
          return true;
        }
        if (interaction.xRatio >= 1 - this.edgeTapRatio) {
          void this.navigate('next', 'tap');
          return true;
        }
      }

      const centerStart = this.edgeTapRatio;
      const centerEnd = 1 - this.edgeTapRatio;
      if (interaction.xRatio > centerStart && interaction.xRatio < centerEnd) {
        this.shell.toggleControls();
        return true;
      }
    }

    return false;
  };

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (this.destroyed || this.controllerState.status !== 'ready' || this.readingModeState.flow !== 'paginated') return;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isEditableTarget(event.target) || this.hasOpenReaderPanel()) return;
    if (window.getSelection()?.toString().trim()) return;

    const direction = keyboardDirection(event.key, event.code, event.shiftKey);
    if (!direction) return;
    event.preventDefault();
    void this.navigate(direction, 'keyboard');
  };

  private hasOpenReaderPanel(): boolean {
    return Boolean(this.shell.root.querySelector(
      '[data-reader-toc-panel]:not([hidden]), [data-reader-appearance-panel]:not([hidden]), [data-reader-mode-panel]:not([hidden])',
    ));
  }

  private refreshAvailability(): void {
    const location = this.controllerState.location;
    const ready = this.controllerState.status === 'ready' && !this.state.busy;
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
