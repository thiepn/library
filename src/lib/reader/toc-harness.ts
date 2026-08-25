import {
  mountReaderPublicationHarness,
  mountReaderShellHarness,
  type ReaderShellHarnessHandle,
} from './harness';
import type { ReaderProgressIdentity } from './progress';
import type { ReaderPublicationCandidate } from './publication';
import { ReaderTocController } from './toc';
import type { ReaderOpenOptions, Unsubscribe } from './types';

export interface ReaderTocHarnessHandle extends ReaderShellHarnessHandle {
  toc: ReaderTocController;
}

function attachToc(base: ReaderShellHarnessHandle): ReaderTocHarnessHandle {
  const toc = new ReaderTocController(base.controller, base.shell.root);
  const cleanups: Unsubscribe[] = [];
  let destroyed = false;

  cleanups.push(toc.subscribe((state) => {
    if (state.activeLabel) base.shell.setChapter(state.activeLabel);
  }));

  cleanups.push(base.shell.onCommand((command) => {
    if (command === 'contents') {
      base.shell.setAppearancePanelOpen(false);
      base.shell.setModePanelOpen(false);
      toc.toggle();
      return;
    }
    if (command === 'appearance' || command === 'more') toc.close(false);
  }));

  toc.start();

  return {
    ...base,
    toc,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups) cleanup();
      toc.destroy();
      base.destroy();
    },
  };
}

/**
 * Non-public fixture harness with the native EPUB navigation tree attached.
 */
export async function mountReaderShellWithTocHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  options: ReaderOpenOptions = {},
  target?: string,
  progressIdentity?: ReaderProgressIdentity,
): Promise<ReaderTocHarnessHandle> {
  const base = await mountReaderShellHarness(root, source, options, target, progressIdentity);
  return attachToc(base);
}

/**
 * Generic publication-aware reader harness with native EPUB TOC navigation and P12 resume state.
 */
export async function mountReaderPublicationWithTocHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderTocHarnessHandle> {
  const base = await mountReaderPublicationHarness(root, publication, options, target);
  return attachToc(base);
}
