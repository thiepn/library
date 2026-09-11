import { mountReaderShell, type ReaderSettingsPanel, type ReaderShellController } from './shell';

const mountedErgonomics = new WeakMap<HTMLElement, ReaderErgonomicsController>();

type ReaderSettingsPanelName = Exclude<ReaderSettingsPanel, 'none'>;

function panelFor(root: HTMLElement, selector: string): HTMLElement {
  const panel = root.querySelector<HTMLElement>(selector);
  if (!panel) throw new Error(`Reader ergonomics is missing required panel: ${selector}`);
  return panel;
}

function commandFor(root: HTMLElement, command: 'appearance' | 'more'): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`[data-reader-command="${command}"]`);
  if (!button) throw new Error(`Reader ergonomics is missing required command: ${command}`);
  return button;
}

function addPanelCloseButton(
  panel: HTMLElement,
  headingSelector: string,
  panelName: ReaderSettingsPanelName,
  label: string,
): HTMLButtonElement {
  const existing = panel.querySelector<HTMLButtonElement>('[data-reader-panel-close]');
  if (existing) return existing;
  const heading = panel.querySelector<HTMLElement>(headingSelector);
  if (!heading) throw new Error(`Reader ergonomics is missing required panel heading: ${headingSelector}`);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reader-shell__panel-close';
  button.dataset.readerPanelClose = panelName;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = '×';
  heading.append(button);
  return button;
}

/**
 * Owns reader-level product ergonomics that sit above the format engine.
 *
 * ReaderShellController is the single source of truth for settings-panel state.
 * This layer owns only presentation affordances around that state: backdrop,
 * explicit close controls, focus restoration, and outside-click dismissal.
 * The reading surface is protected while a panel is open so an exposed tap can
 * never also become EPUB navigation behind the sheet.
 */
export class ReaderErgonomicsController {
  private readonly shell: ReaderShellController;
  private readonly modePanel: HTMLElement;
  private readonly appearancePanel: HTMLElement;
  private readonly appearanceTrigger: HTMLButtonElement;
  private readonly modeTrigger: HTMLButtonElement;
  private readonly backdrop: HTMLDivElement;
  private readonly appearanceClose: HTMLButtonElement;
  private readonly modeClose: HTMLButtonElement;
  private focusFrame: number | null = null;
  private destroyed = false;

  constructor(private readonly root: HTMLElement) {
    this.shell = mountReaderShell(root);
    this.modePanel = panelFor(root, '[data-reader-mode-panel]');
    this.appearancePanel = panelFor(root, '[data-reader-appearance-panel]');
    this.appearanceTrigger = commandFor(root, 'appearance');
    this.modeTrigger = commandFor(root, 'more');
    this.appearanceClose = addPanelCloseButton(
      this.appearancePanel,
      '.reader-shell__panel-heading',
      'appearance',
      'Close reading appearance',
    );
    this.modeClose = addPanelCloseButton(
      this.modePanel,
      '.reader-shell__mode-heading',
      'mode',
      'Close reading mode',
    );

    const existing = root.querySelector<HTMLDivElement>('[data-reader-panel-backdrop]');
    this.backdrop = existing ?? document.createElement('div');
    if (!existing) {
      this.backdrop.className = 'reader-shell__panel-backdrop';
      this.backdrop.dataset.readerPanelBackdrop = '';
      this.backdrop.setAttribute('aria-hidden', 'true');
      this.backdrop.hidden = true;
      root.append(this.backdrop);
    }

    this.root.addEventListener('click', this.handleClickCapture, true);
    this.root.addEventListener('reader-shell:panel-change', this.handlePanelChange as EventListener);
    this.syncBackdrop();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = null;
    this.root.removeEventListener('click', this.handleClickCapture, true);
    this.root.removeEventListener('reader-shell:panel-change', this.handlePanelChange as EventListener);
    this.appearanceClose.remove();
    this.modeClose.remove();
    this.backdrop.remove();
    mountedErgonomics.delete(this.root);
  }

  private readonly handleClickCapture = (event: MouseEvent) => {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin) return;

    const close = origin.closest<HTMLButtonElement>('[data-reader-panel-close]');
    if (close && this.root.contains(close)) {
      event.preventDefault();
      const panel: ReaderSettingsPanelName = close.dataset.readerPanelClose === 'mode' ? 'mode' : 'appearance';
      this.closePanels(panel);
      return;
    }

    if (origin.closest('[data-reader-panel-backdrop]')) {
      event.preventDefault();
      const open = this.shell.openSettingsPanel;
      this.closePanels(open === 'mode' ? 'mode' : open === 'appearance' ? 'appearance' : undefined);
      return;
    }

    const command = origin.closest<HTMLElement>('[data-reader-command]');
    if (!command || !this.root.contains(command)) return;

    // Settings controls own their interaction while the panel is open. Commands
    // elsewhere in the shell close floating settings first, then continue through
    // the canonical command path exactly once.
    if (command.closest('[data-reader-mode-panel], [data-reader-appearance-panel]')) return;
    if (command.dataset.readerCommand === 'appearance' || command.dataset.readerCommand === 'more') return;
    if (this.shell.openSettingsPanel !== 'none') this.closePanels();
  };

  private readonly handlePanelChange = () => {
    this.syncBackdrop();
    const panel = this.shell.openSettingsPanel;
    if (panel === 'none') return;

    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = null;
      if (this.destroyed || this.shell.openSettingsPanel !== panel) return;
      const close = panel === 'appearance' ? this.appearanceClose : this.modeClose;
      try {
        close.focus({ preventScroll: true });
      } catch {
        close.focus();
      }
    });
  };

  private closePanels(restoreFocus?: ReaderSettingsPanelName): void {
    if (this.shell.openSettingsPanel !== 'none') this.shell.setSettingsPanel('none');
    else this.syncBackdrop();
    if (restoreFocus === 'appearance') this.appearanceTrigger.focus();
    if (restoreFocus === 'mode') this.modeTrigger.focus();
  }

  private syncBackdrop(): void {
    if (this.destroyed) return;
    const open = this.shell.openSettingsPanel !== 'none';
    this.backdrop.hidden = !open;
    this.backdrop.setAttribute('aria-hidden', String(!open));
  }
}

export function mountReaderErgonomics(root: HTMLElement): ReaderErgonomicsController {
  const existing = mountedErgonomics.get(root);
  if (existing) return existing;
  const controller = new ReaderErgonomicsController(root);
  mountedErgonomics.set(root, controller);
  return controller;
}
