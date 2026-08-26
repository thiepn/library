import type { ReaderProgressIdentity } from './progress';
import type { ReaderPublicationCandidate } from './publication';
import { ReaderSearchController } from './search';
import {
  mountReaderPublicationWithTocHarness,
  mountReaderShellWithTocHarness,
  type ReaderTocHarnessHandle,
} from './toc-harness';
import type { ReaderOpenOptions, Unsubscribe } from './types';

export interface ReaderSearchHarnessHandle extends ReaderTocHarnessHandle {
  search: ReaderSearchController;
}

function attachSearch(
  base: ReaderTocHarnessHandle,
  source: string | ArrayBuffer,
  identity?: ReaderProgressIdentity,
): ReaderSearchHarnessHandle {
  const search = new ReaderSearchController(base.controller, base.shell, source, {
    ...(identity ? { identity } : {}),
  });
  const cleanups: Unsubscribe[] = [];
  let destroyed = false;

  cleanups.push(search.subscribe((state) => {
    if (state.open) base.toc.close(false);
  }));
  search.start();

  return {
    ...base,
    search,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups) cleanup();
      search.destroy();
      base.destroy();
    },
  };
}

/** Non-public fixture harness with P13 native TOC plus P18 native EPUB search. */
export async function mountReaderShellWithSearchHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  options: ReaderOpenOptions = {},
  target?: string,
  progressIdentity?: ReaderProgressIdentity,
): Promise<ReaderSearchHarnessHandle> {
  const base = await mountReaderShellWithTocHarness(root, source, options, target, progressIdentity);
  return attachSearch(base, source, progressIdentity);
}

/** Generic publication-aware staged reader with exact-release search caching and native TOC. */
export async function mountReaderPublicationWithSearchHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderSearchHarnessHandle> {
  const base = await mountReaderPublicationWithTocHarness(root, publication, options, target);
  return attachSearch(base, publication.epub.url, {
    workId: publication.workId,
    edition: publication.edition,
    releaseVersion: publication.version,
  });
}
