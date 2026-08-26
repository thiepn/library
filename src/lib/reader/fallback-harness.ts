import {
  mountReaderPublicationWithCompatibilityHarness,
  type ReaderCompatibilityHarnessHandle,
} from './compatibility-harness';
import { clearReaderFailureState, setReaderFailureState } from './fallback';
import { mountReaderShell } from './shell';
import type { ReaderDesktopOptions } from './desktop';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions } from './types';

export interface ReaderFallbackHarnessHandle {
  readonly publication: ReaderPublicationCandidate;
  readonly reader: ReaderCompatibilityHarnessHandle | undefined;
  retry(): Promise<boolean>;
  destroy(): void;
}

/**
 * Owns initial native-reader boot recovery without weakening the publication contract.
 * A failed EPUB never auto-redirects to another format or edition: P26 leaves alternate
 * reading paths as explicit user choices rendered by ReaderShell.
 */
export class ReaderFallbackController implements ReaderFallbackHarnessHandle {
  readonly publication: ReaderPublicationCandidate;

  private activeReader: ReaderCompatibilityHarnessHandle | undefined;
  private readonly root: HTMLElement;
  private readonly openOptions: ReaderOpenOptions;
  private readonly target: string | undefined;
  private readonly desktopOptions: ReaderDesktopOptions;
  private destroyed = false;
  private opening = false;
  private retryBound = false;
  private attempt = 0;

  constructor(
    root: HTMLElement,
    publication: ReaderPublicationCandidate,
    openOptions: ReaderOpenOptions = {},
    target?: string,
    desktopOptions: ReaderDesktopOptions = {},
  ) {
    this.root = root;
    this.publication = publication;
    this.openOptions = openOptions;
    this.target = target;
    this.desktopOptions = desktopOptions;
  }

  get reader(): ReaderCompatibilityHarnessHandle | undefined {
    return this.activeReader;
  }

  async start(): Promise<void> {
    await this.retry();
  }

  async retry(): Promise<boolean> {
    if (this.destroyed || this.opening) return false;
    this.opening = true;
    this.attempt += 1;
    const attempt = this.attempt;
    this.unbindFailureRetry();

    this.activeReader?.destroy();
    this.activeReader = undefined;

    const shell = mountReaderShell(this.root);
    clearReaderFailureState(shell);
    shell.setStatus('loading', this.attempt > 1 ? 'Trying the book again…' : 'Opening book…');

    try {
      const reader = await mountReaderPublicationWithCompatibilityHarness(
        this.root,
        this.publication,
        this.openOptions,
        this.target,
        this.desktopOptions,
      );

      if (this.destroyed || attempt !== this.attempt) {
        reader.destroy();
        return false;
      }

      this.activeReader = reader;
      clearReaderFailureState(reader.shell);
      return true;
    } catch (error) {
      if (this.destroyed || attempt !== this.attempt) return false;

      // The P5-P24 harness deliberately destroys partial runtime state on failed boot.
      // Recreate only the inert shell so the recovery UI and explicit fallback links remain live.
      const failureShell = mountReaderShell(this.root);
      setReaderFailureState(failureShell, error);
      this.bindFailureRetry();
      return false;
    } finally {
      if (attempt === this.attempt) this.opening = false;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.attempt += 1;
    this.unbindFailureRetry();
    this.activeReader?.destroy();
    this.activeReader = undefined;
  }

  private bindFailureRetry(): void {
    if (this.retryBound || this.destroyed) return;
    this.retryBound = true;
    this.root.addEventListener('click', this.handleFailureRetry);
  }

  private unbindFailureRetry(): void {
    if (!this.retryBound) return;
    this.retryBound = false;
    this.root.removeEventListener('click', this.handleFailureRetry);
  }

  private readonly handleFailureRetry = (event: MouseEvent) => {
    const origin = event.target instanceof Element ? event.target : null;
    const retry = origin?.closest<HTMLElement>('[data-reader-command="retry"]');
    if (!retry || !this.root.contains(retry) || retry.matches(':disabled')) return;
    event.preventDefault();
    void this.retry();
  };
}

/**
 * Public-route-ready P26 wrapper around the complete P24 reader stack.
 * It resolves boot failures into a stable recovery state instead of rejecting the page launch.
 */
export async function mountReaderPublicationWithFallbackHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderFallbackHarnessHandle> {
  const fallback = new ReaderFallbackController(root, publication, options, target, desktopOptions);
  await fallback.start();
  return fallback;
}
