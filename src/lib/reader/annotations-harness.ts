import type { ReaderAnnotationIdentity } from './annotation-store';
import { ReaderAnnotationsController } from './annotations';
import {
  mountReaderPublicationWithBookmarksHarness,
  mountReaderShellWithBookmarksHarness,
  type ReaderBookmarksHarnessHandle,
} from './bookmarks-harness';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions, Unsubscribe } from './types';

export interface ReaderAnnotationsHarnessHandle extends ReaderBookmarksHarnessHandle {
  annotations: ReaderAnnotationsController;
}

function attachAnnotations(
  base: ReaderBookmarksHarnessHandle,
  identity: ReaderAnnotationIdentity,
): ReaderAnnotationsHarnessHandle {
  const annotations = new ReaderAnnotationsController(base.controller, base.shell, { identity });
  const cleanups: Unsubscribe[] = [];
  let destroyed = false;

  cleanups.push(annotations.subscribe((state) => {
    if (state.open) {
      base.bookmarks.close(false);
      base.search.close(false);
      base.toc.close(false);
    }
  }));
  cleanups.push(base.bookmarks.subscribe((state) => {
    if (state.open) {
      annotations.close(false);
      annotations.dismissSelection();
    }
  }));
  cleanups.push(base.search.subscribe((state) => {
    if (state.open) {
      annotations.close(false);
      annotations.dismissSelection();
    }
  }));
  cleanups.push(base.toc.subscribe((state) => {
    if (state.open) {
      annotations.close(false);
      annotations.dismissSelection();
    }
  }));
  annotations.start();

  return {
    ...base,
    annotations,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups) cleanup();
      annotations.destroy();
      base.destroy();
    },
  };
}

/** Non-public fixture harness with P13 TOC, P18 search, P19 bookmarks, and P20 annotations. */
export async function mountReaderShellWithAnnotationsHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  identity: ReaderAnnotationIdentity,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderAnnotationsHarnessHandle> {
  const base = await mountReaderShellWithBookmarksHarness(root, source, identity, options, target);
  return attachAnnotations(base, identity);
}

/** Generic publication-aware staged reader with exact-release highlights and notes. */
export async function mountReaderPublicationWithAnnotationsHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderAnnotationsHarnessHandle> {
  const base = await mountReaderPublicationWithBookmarksHarness(root, publication, options, target);
  return attachAnnotations(base, {
    workId: publication.workId,
    edition: publication.edition,
    releaseVersion: publication.version,
  });
}
