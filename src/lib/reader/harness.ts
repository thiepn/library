import { ReaderController } from './controller';
import { ReaderReadingModeController, type ReaderReadingModeOptions } from './reading-mode';
import { mountReaderShell, type ReaderShellController } from './shell';
import type { ReaderOpenOptions, Unsubscribe } from './types';

export interface ReaderHarnessHandle {
  controller: ReaderController;
  destroy(): void;
}

export interface ReaderShellHarnessHandle extends ReaderHarnessHandle {
  shell: ReaderShellController;
  readingMode: ReaderReadingModeController;
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
 * Connects the reader shell, reading-mode controller, and EPUB engine without exposing a book route.
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
  const readingModeOptions: ReaderReadingModeOptions = {
    ...(options.flow ? { flow: options.flow } : {}),
    ...(options.spread ? { spread: options.spread } : {}),
    ...(options.minSpreadWidth !== undefined ? { minSpreadWidth: options.minSpreadWidth } : {}),
  };
  const readingMode = new ReaderReadingModeController(controller, shell.viewport, readingModeOptions);
  const cleanups: Unsubscribe[] = [];
  let destroyed = false;
  let modesStarted = false;

  const open = async () => {
    shell.setStatus('loading', 'Opening book…');
    try {
      await controller.open(source, shell.viewport, options, target);
      if (modesStarted) await readingMode.reapply();
      else {
        modesStarted = true;
        await readingMode.start();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open EPUB publication.';
      shell.setStatus('error', message);
      throw error;
    }
  };

  cleanups.push(readingMode.subscribe((state) => {
    shell.setReadingMode(state.flow, state.spreadPreference, state.effectiveSpread);
  }));

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
    const run = async () => {
      if (command === 'previous') await controller.previous();
      if (command === 'next') await controller.next();
      if (command === 'retry') await open();
      if (command === 'flow-paginated') {
        await readingMode.setFlow('paginated');
        shell.announce('Paginated reading mode');
      }
      if (command === 'flow-scrolled') {
        await readingMode.setFlow('scrolled');
        shell.announce('Scrolling reading mode');
      }
      if (command === 'spread-auto') {
        await readingMode.setSpreadPreference('auto');
        shell.announce('Automatic page spread');
      }
      if (command === 'spread-single') {
        await readingMode.setSpreadPreference('single');
        shell.announce('Single page spread');
      }
      if (command === 'spread-double') {
        await readingMode.setSpreadPreference('double');
        shell.announce('Two page spread where space allows');
      }
    };

    void run().catch((error) => {
      const message = error instanceof Error ? error.message : 'Unable to change reading layout.';
      shell.setStatus('error', message);
    });
  }));

  try {
    await open();
  } catch (error) {
    for (const cleanup of cleanups) cleanup();
    readingMode.destroy();
    controller.destroy();
    shell.destroy();
    throw error;
  }

  return {
    controller,
    shell,
    readingMode,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups) cleanup();
      readingMode.destroy();
      controller.destroy();
      shell.destroy();
    },
  };
}
