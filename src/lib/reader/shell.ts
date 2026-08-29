import type { ReaderAlignment, ReaderFlow, ReaderFontFamily, ReaderSpread, Unsubscribe } from './types';
import type { ReaderTypographyState } from './typography';

export type ReaderShellStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ReaderShellCommand =
  | 'previous'
  | 'next'
  | 'contents'
  | 'appearance'
  | 'more'
  | 'retry'
  | 'flow-paginated'
  | 'flow-scrolled'
  | 'spread-auto'
  | 'spread-single'
  | 'spread-double';

export type ReaderTypographyIntent =
  | { type: 'fontFamily'; value: ReaderFontFamily }
  | { type: 'fontScale'; value: number }
  | { type: 'lineHeight'; value: number }
  | { type: 'paragraphSpacing'; value: number }
  | { type: 'alignment'; value: ReaderAlignment }
  | { type: 'reset' };

export interface ReaderNavigationAvailability {
  previous: boolean;
  next: boolean;
}

export interface ReaderProgressDisplay {
  label: string;
  percentage?: number;
}

type CommandListener = (command: ReaderShellCommand) => void;
type TypographyListener = (intent: ReaderTypographyIntent) => void;

const mountedShells = new WeakMap<HTMLElement, ReaderShellController>();
const POINTER_REVEAL_GUARD_MS = 450;
const POINTER_REVEAL_DISTANCE_PX = 14;

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
  private readonly modePanel: HTMLElement;
  private readonly appearancePanel: HTMLElement;
  private readonly moreButton: HTMLButtonElement;
  private readonly appearanceButton: HTMLButtonElement;
  private readonly commandListeners = new Set<CommandListener>();
  private readonly typographyListeners = new Set<TypographyListener>();
  private hideTimer: number | null = null;
  private autoHide = false;
  private autoHideDelay = 3600;
  private controlsHiddenAt = -Infinity;
  private pointerRevealAnchor: { x: number; y: number } | null = null;
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
    this.modePanel = requireElement(root, '[data-reader-mode-panel]');
    this.appearancePanel = requireElement(root, '[data-reader-appearance-panel]');
    this.moreButton = requireElement<HTMLButtonElement>(root, '[data-reader-command="more"]');
    this.appearanceButton = requireElement<HTMLButtonElement>(root, '[data-reader-command="appearance"]');

    root.addEventListener('click', this.handleClick);
    root.addEventListener('input', this.handleInput);
    root.addEventListener('pointermove', this.handlePointerActivity, { passive: true });
    root.addEventListener('focusin', this.handleFocusActivity);
    root.addEventListener('reader-shell:toggle-controls', this.handleToggleControls as EventListener);
    document.addEventListener('keydown', this.handleKeydown);

    this.setControlsVisible(true);
    this.setReadingMode('paginated', 'auto', 'single');
    this.setTypography({ fontFamily: 'publisher', fontScale: 1, lineHeight: 1.55, paragraphSpacing: 0, alignment: 'left' });
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
    this.appearanceButton.disabled = status !== 'ready';
    this.moreButton.disabled = status !== 'ready';
    if (status !== 'ready') {
      this.setNavigationAvailability({ previous: false, next: false });
      this.setModePanelOpen(false);
      this.setAppearancePanelOpen(false);
    }

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

  setReadingMode(flow: ReaderFlow, spreadPreference: ReaderSpread, effectiveSpread: Exclude<ReaderSpread, 'auto'>): void {
    this.assertUsable();
    this.root.dataset.readerFlow = flow;
    this.root.dataset.readerSpreadPreference = spreadPreference;
    this.root.dataset.readerSpread = effectiveSpread;

    this.root.querySelectorAll<HTMLButtonElement>('[data-reader-flow-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.readerFlowOption === flow));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-reader-spread-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.readerSpreadOption === spreadPreference));
      button.disabled = flow === 'scrolled';
    });

    const summary = this.root.querySelector<HTMLElement>('[data-reader-mode-summary]');
    if (summary) {
      const flowLabel = flow === 'paginated' ? 'Pages' : 'Scroll';
      const spreadLabel = flow === 'scrolled' ? 'single column' : effectiveSpread === 'double' ? 'two pages' : 'one page';
      summary.textContent = `${flowLabel} · ${spreadLabel}`;
    }
  }

  setTypography(state: ReaderTypographyState): void {
    this.assertUsable();
    this.root.dataset.readerFontFamily = state.fontFamily;
    this.root.dataset.readerAlignment = state.alignment;
    this.root.querySelectorAll<HTMLButtonElement>('[data-reader-font-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.readerFontOption === state.fontFamily));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-reader-alignment-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.readerAlignmentOption === state.alignment));
    });
    this.setRangeValue('fontScale', state.fontScale, `${Math.round(state.fontScale * 100)}%`);
    this.setRangeValue('lineHeight', state.lineHeight, state.lineHeight.toFixed(2));
    this.setRangeValue('paragraphSpacing', state.paragraphSpacing, `${state.paragraphSpacing.toFixed(1)}em`);
  }

  setModePanelOpen(open: boolean): void {
    this.assertUsable();
    if (open) {
      this.appearancePanel.hidden = true;
      this.appearanceButton.setAttribute('aria-expanded', 'false');
    }
    this.modePanel.hidden = !open;
    this.moreButton.setAttribute('aria-expanded', String(open));
  }

  toggleModePanel(): void {
    this.setModePanelOpen(this.modePanel.hidden);
  }

  setAppearancePanelOpen(open: boolean): void {
    this.assertUsable();
    if (open) {
      this.modePanel.hidden = true;
      this.moreButton.setAttribute('aria-expanded', 'false');
    }
    this.appearancePanel.hidden = !open;
    this.appearanceButton.setAttribute('aria-expanded', String(open));
  }

  toggleAppearancePanel(): void {
    this.setAppearancePanelOpen(this.appearancePanel.hidden);
  }

  setControlsVisible(visible: boolean): void {
    this.assertUsable();
    this.root.dataset.readerControls = visible ? 'visible' : 'hidden';
    for (const bar of [this.topbar, this.bottombar]) {
      bar.setAttribute('aria-hidden', visible ? 'false' : 'true');
      bar.toggleAttribute('inert', !visible);
    }
    if (!visible) {
      this.controlsHiddenAt = performance.now();
      this.pointerRevealAnchor = null;
      this.setModePanelOpen(false);
      this.setAppearancePanelOpen(false);
    } else {
      this.pointerRevealAnchor = null;
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

  onTypographyIntent(listener: TypographyListener): Unsubscribe {
    this.assertUsable();
    this.typographyListeners.add(listener);
    return () => this.typographyListeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearAutoHide();
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('input', this.handleInput);
    this.root.removeEventListener('pointermove', this.handlePointerActivity);
    this.root.removeEventListener('focusin', this.handleFocusActivity);
    this.root.removeEventListener('reader-shell:toggle-controls', this.handleToggleControls as EventListener);
    document.removeEventListener('keydown', this.handleKeydown);
    this.commandListeners.clear();
    this.typographyListeners.clear();
    mountedShells.delete(this.root);
  }

  private readonly handleClick = (event: MouseEvent) => {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin) return;

    const reset = origin.closest<HTMLElement>('[data-reader-typography-reset]');
    if (reset && this.root.contains(reset)) {
      this.showControls();
      this.emitTypography({ type: 'reset' });
      return;
    }

    const typographyOption = origin.closest<HTMLElement>('[data-reader-typography-property][data-reader-typography-value]');
    if (typographyOption && this.root.contains(typographyOption)) {
      this.showControls();
      const property = typographyOption.dataset.readerTypographyProperty;
      const value = typographyOption.dataset.readerTypographyValue;
      if (property === 'fontFamily' && value) this.emitTypography({ type: 'fontFamily', value: value as ReaderFontFamily });
      if (property === 'alignment' && value) this.emitTypography({ type: 'alignment', value: value as ReaderAlignment });
      return;
    }

    const target = origin.closest<HTMLElement>('[data-reader-command]');
    if (!target || !this.root.contains(target)) return;
    const command = target.dataset.readerCommand as ReaderShellCommand | undefined;
    if (!command || target.matches(':disabled')) return;
    this.showControls();
    if (command === 'appearance') this.toggleAppearancePanel();
    if (command === 'more') this.toggleModePanel();
    for (const listener of this.commandListeners) listener(command);
  };

  private readonly handleInput = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const property = event.target.dataset.readerTypographyInput;
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    if (property === 'fontScale') this.emitTypography({ type: 'fontScale', value });
    if (property === 'lineHeight') this.emitTypography({ type: 'lineHeight', value });
    if (property === 'paragraphSpacing') this.emitTypography({ type: 'paragraphSpacing', value });
  };

  private readonly handlePointerActivity = (event: PointerEvent) => {
    if (this.root.dataset.readerControls !== 'hidden') {
      this.scheduleAutoHide();
      return;
    }

    // Touch contact itself must never reopen chrome after a center tap. On desktop/pen input,
    // reveal only after a deliberate movement outside a short post-hide guard window so the
    // pointermove generated by the same click cannot immediately undo toggleControls().
    if (event.pointerType === 'touch') return;
    const now = performance.now();
    if (now - this.controlsHiddenAt < POINTER_REVEAL_GUARD_MS) {
      this.pointerRevealAnchor = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!this.pointerRevealAnchor) {
      this.pointerRevealAnchor = { x: event.clientX, y: event.clientY };
      return;
    }

    const distance = Math.hypot(
      event.clientX - this.pointerRevealAnchor.x,
      event.clientY - this.pointerRevealAnchor.y,
    );
    if (distance >= POINTER_REVEAL_DISTANCE_PX) this.showControls();
  };

  private readonly handleFocusActivity = (event: FocusEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    // Tapping/clicking EPUB content can focus the iframe. That is reading activity, not a request
    // to reveal chrome. Shell controls/panels still reveal chrome when keyboard focus enters them.
    if (target && this.viewport.contains(target)) return;
    if (this.root.dataset.readerControls === 'hidden') this.showControls();
    else this.scheduleAutoHide();
  };

  private readonly handleToggleControls = () => this.toggleControls();

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (!this.appearancePanel.hidden) this.setAppearancePanelOpen(false);
    else if (!this.modePanel.hidden) this.setModePanelOpen(false);
    else this.showControls();
  };

  private emitTypography(intent: ReaderTypographyIntent): void {
    for (const listener of this.typographyListeners) listener(intent);
  }

  private setRangeValue(property: 'fontScale' | 'lineHeight' | 'paragraphSpacing', value: number, label: string): void {
    const input = this.root.querySelector<HTMLInputElement>(`[data-reader-typography-input="${property}"]`);
    const output = this.root.querySelector<HTMLOutputElement>(`[data-reader-typography-output="${property}"]`);
    if (input && Number(input.value) !== value) input.value = String(value);
    if (output) output.value = label;
  }

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