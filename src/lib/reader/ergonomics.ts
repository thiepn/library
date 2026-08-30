import { mountReaderShell, type ReaderShellController } from './shell';

const mountedErgonomics = new WeakMap<HTMLElement, ReaderErgonomicsController>();

function panelFor(root: HTMLElement, selector: string): HTMLElement {
  const panel = root.querySelector<HTMLElement>(selector);
  if (!panel) throw new Error(`Reader ergonomics is missing required panel: ${selector}`);
  return panel;
}

/**
 * Owns reader-level product ergonomics that sit above the format engine.
 *
 * The settings panels intentionally remain non-modal so the top and bottom
 * reader bars stay available. The reading surface itself is protected while a
 * panel is open: tapping/clicking exposed publication content dismisses the
 * panel instead of turning a page behind it.
 */
export class ReaderErgonomicsController {
  private readonly shell: ReaderShellController;
  private readonly modePanel: HTMLElement;
  private readonly appearancePanel: HTMLElement;
  private readonly backdrop: HTMLDivElement;
  private readonly observer: MutationObserver;
  private destroyed = false;

  constructor(private readonly root: HTMLElement) {
    this.shell = mountReaderShell(root);
    this.modePanel = panelFor(root, '[data-reader-mode-panel]');
    this.appearancePanel = panelFor(root, '[data-reader-appearance-panel]');

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
    this.observer = new MutationObserver(this.syncBackdrop);
    this.observer.observe(this.modePanel, { attributes: true, attributeFilter: ['hidden'] });
    this.observer.observe(this.appearancePanel, { attributes: true, attributeFilter: ['hidden'] });
    this.syncBackdrop();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeEventListener('click', this.handleClickCapture, true);
    this.observer.disconnect();
    this.backdrop.remove();
    mountedErgonomics.delete(this.root);
  }

  private readonly handleClickCapture = (event: MouseEvent) => {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin) return;

    if (origin.closest('[data-reader-panel-backdrop]')) {
      event.preventDefault();
      this.closePanels();
      return;
    }

    const command = origin.closest<HTMLElement>('[data-reader-command]');
    if (!command || !this.root.contains(command)) return;

    // Settings controls own their interaction while the panel is open. Commands
    // elsewhere in the shell close floating settings first, then continue through
    // the existing canonical command path exactly once.
    if (command.closest('[data-reader-mode-panel], [data-reader-appearance-panel]')) return;
    if (command.dataset.readerCommand === 'appearance' || command.dataset.readerCommand === 'more') return;
    this.closePanels();
  };

  private closePanels(): void {
    this.shell.setModePanelOpen(false);
    this.shell.setAppearancePanelOpen(false);
    this.syncBackdrop();
  }

  private readonly syncBackdrop = () => {
    if (this.destroyed) return;
    const open = !this.modePanel.hidden || !this.appearancePanel.hidden;
    this.backdrop.hidden = !open;
    this.root.dataset.readerPanel = !this.appearancePanel.hidden
      ? 'appearance'
      : !this.modePanel.hidden
        ? 'mode'
        : 'none';
  };
}

export function mountReaderErgonomics(root: HTMLElement): ReaderErgonomicsController {
  const existing = mountedErgonomics.get(root);
  if (existing) return existing;
  const controller = new ReaderErgonomicsController(root);
  mountedErgonomics.set(root, controller);
  return controller;
}
