import {
  mountCanonicalEpubReader,
  readerCanonicalCandidateFromPublication,
  type ReaderCanonicalEpubCandidate,
} from './canonical';
import { clearReaderFailureState, setReaderFailureState } from './fallback';
import { mountReaderShell } from './shell';
import type { ReaderCompatibilityHarnessHandle } from './compatibility-harness';
import type { ReaderDesktopOptions } from './desktop';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions } from './types';

export interface ReaderSourceFallbackHarnessHandle {
  readonly candidate: ReaderCanonicalEpubCandidate;
  readonly reader: ReaderCompatibilityHarnessHandle | undefined;
  retry(): Promise<boolean>;
  destroy(): void;
}

export interface ReaderFallbackHarnessHandle extends ReaderSourceFallbackHarnessHandle {
  readonly publication: ReaderPublicationCandidate;
}

/**
 * ER3 source-neutral recovery owner. Hosted URLs and browser-local ArrayBuffers use exactly
 * the same complete reader mount, retry, partial-cleanup, and failure-presentation behavior.
 */
export class ReaderSourceFallbackController implements ReaderSourceFallbackHarnessHandle {
  readonly candidate: ReaderCanonicalEpubCandidate;

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
    candidate: ReaderCanonicalEpubCandidate,
    openOptions: ReaderOpenOptions = {},
    target?: string,
    desktopOptions: ReaderDesktopOptions = {},
  ) {
    this.root = root;
    this.candidate = candidate;
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
      const reader = await mountCanonicalEpubReader(
        this.root,
        this.candidate,
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

      // The complete reader stack destroys partial runtime state on failed boot. Recreate only
      // the inert shell so retry and explicit recovery actions remain available.
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
 * Backward-compatible hosted-publication recovery controller. It now adapts the publication
 * once, then delegates every mount/retry to the same source-neutral ER3 runtime used locally.
 */
export class ReaderFallbackController implements ReaderFallbackHarnessHandle {
  readonly publication: ReaderPublicationCandidate;
  readonly candidate: ReaderCanonicalEpubCandidate;
  private readonly sourceController: ReaderSourceFallbackController;

  constructor(
    root: HTMLElement,
    publication: ReaderPublicationCandidate,
    openOptions: ReaderOpenOptions = {},
    target?: string,
    desktopOptions: ReaderDesktopOptions = {},
  ) {
    this.publication = publication;
    this.candidate = readerCanonicalCandidateFromPublication(publication);
    this.sourceController = new ReaderSourceFallbackController(
      root,
      this.candidate,
      openOptions,
      target,
      desktopOptions,
    );
  }

  get reader(): ReaderCompatibilityHarnessHandle | undefined {
    return this.sourceController.reader;
  }

  start(): Promise<void> {
    return this.sourceController.start();
  }

  retry(): Promise<boolean> {
    return this.sourceController.retry();
  }

  destroy(): void {
    this.sourceController.destroy();
  }
}

/** Complete public-reader recovery stack for a source-neutral EPUB candidate. */
export async function mountReaderSourceWithFallbackHarness(
  root: HTMLElement,
  candidate: ReaderCanonicalEpubCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderSourceFallbackHarnessHandle> {
  const fallback = new ReaderSourceFallbackController(root, candidate, options, target, desktopOptions);
  await fallback.start();
  return fallback;
}

/**
 * Public hosted-publication wrapper. Publication identity remains stable across retries while the
 * underlying mount is the same canonical source-neutral reader used by personal EPUBs.
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
