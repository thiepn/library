import { ReaderController } from './controller';
import { mountReaderShell, type ReaderShellController } from './shell';
import type { ReaderOpenOptions, Unsubscribe } from './types';

export interface ReaderHarnessHandle {
  controller: ReaderController;
  destroy(): void;
}

export interface ReaderShellHarnessHandle extends ReaderHarnessHandle {
  shell: ReaderShellController;
}

/**
 * Mounts the EPUB reader core without creating a public Library route.
 * Intended for synthetic fixtures, browser tests, and local development only.
 */
export async function mountReaderEngineHarness(
  container: Element,
  source: string | ArrayBuffer,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderHarnessHandle> {
  const controller = new ReaderController();
  try {
    await controller.open(source, container, options, target);
    return {
      controller,
      destroy: () => controller.destroy(),
    };
  } catch (error) {
    controller.destroy();
    throw error;
  }
}

/**
 * Connects the P6 reader shell to the P5 EPUB engine without exposing a book route.
 * The harness is deliberately publication-agnostic and can be exercised with synthetic EPUB fixtures.
 */
export async function mountReaderShellHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderShellHarnessHandle> {
  const shell = mountReaderShell(root);
  const controller = new ReaderController();
  const cleanups: Unsubscribe[] = [];
  let destroyed = false;

  const open = async () => {
    shell.setStatus('loading', 'Opening book…');
    try {
      await controller.open(source, shell.viewport, options, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open EPUB publication.';
      shell.setStatus('error', message);
      throw error;
    }
  };

  cleanups.push(controller.subscribe((state) => {
    if (state.status === 'loading') shell.setStatus('loading');
    if (state.status === 'ready') shell.setStatus('ready');
    if (state.status === 'error') shell.setStatus('error', state.error?.message ?? 'Unable to open EPUB publication.');

    if (state.location) {
      shell.setChapter(state.location.href || 'Current section');
      const percentage = state.location.percentage;
      shell.setProgress({
        label: percentage === undefined ? 'Reading' : `${Math.round(percentage * 100)}%`,
        ...(percentage === undefined ? {} : { percentage }),
      });
      shell.setNavigationAvailability({ previous: !state.location.atStart, next: !state.location.atEnd });
    }
  }));

  cleanups.push(shell.onCommand((command) => {
    if (command === 'previous') void controller.previous();
    if (command === 'next') void controller.next();
    if (command === 'retry') void open().catch(() => undefined);
  }));

  try {
    await open();
  } catch (error) {
    for (const cleanup of cleanups) cleanup();
    controller.destroy();
    shell.destroy();
    throw error;
  }

  return {
    controller,
    shell,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups) cleanup();
      controller.destroy();
      shell.destroy();
    },
  };
}
