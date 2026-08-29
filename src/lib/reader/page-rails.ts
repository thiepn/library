import type {
  ReaderNavigationController,
  ReaderNavigationDirection,
  ReaderNavigationState,
} from './navigation';
import type { ReaderShellController } from './shell';
import type { Unsubscribe } from './types';

function createArrow(direction: ReaderNavigationDirection): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', direction === 'previous' ? 'M15 5 8 12l7 7' : 'm9 5 7 7-7 7');
  svg.append(path);
  return svg;
}

function createRail(direction: ReaderNavigationDirection): HTMLButtonElement {
  const button = document.createElement('button');
  const label = direction === 'previous' ? 'Previous page' : 'Next page';
  button.type = 'button';
  button.className = `reader-shell__page-rail reader-shell__page-rail--${direction}`;
  button.dataset.readerPageRail = direction;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = true;
  button.hidden = true;
  button.append(createArrow(direction));
  return button;
}

/**
 * Adds explicit desktop/fine-pointer page-turn controls without creating another navigation owner.
 * The rails call the existing ReaderNavigationController directly, so touch/swipe/tap/keyboard,
 * footer buttons, boundaries, busy serialization, and page rails all share one command path.
 */
export class ReaderPageRailController {
  private readonly shell: ReaderShellController;
  private readonly navigation: ReaderNavigationController;
  private readonly previous = createRail('previous');
  private readonly next = createRail('next');
  private unsubscribe: Unsubscribe | undefined;
  private started = false;
  private destroyed = false;

  constructor(shell: ReaderShellController, navigation: ReaderNavigationController) {
    this.shell = shell;
    this.navigation = navigation;
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;

    const stage = this.shell.root.querySelector<HTMLElement>('[data-reader-stage]');
    if (!stage) throw new Error('Reader shell is missing required element: [data-reader-stage]');

    stage.append(this.previous, this.next);
    this.previous.addEventListener('click', this.handlePrevious);
    this.next.addEventListener('click', this.handleNext);
    this.unsubscribe = this.navigation.subscribe((state) => this.applyState(state));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.previous.removeEventListener('click', this.handlePrevious);
    this.next.removeEventListener('click', this.handleNext);
    this.previous.remove();
    this.next.remove();
  }

  private readonly handlePrevious = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void this.navigation.navigate('previous', 'button');
  };

  private readonly handleNext = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void this.navigation.navigate('next', 'button');
  };

  private applyState(state: ReaderNavigationState): void {
    const paginated = state.flow === 'paginated';
    this.previous.hidden = !paginated;
    this.next.hidden = !paginated;
    this.previous.disabled = !paginated || !state.previous;
    this.next.disabled = !paginated || !state.next;
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader page rail controller has been destroyed.');
  }
}
