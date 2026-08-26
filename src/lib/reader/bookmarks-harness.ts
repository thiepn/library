import { ReaderBookmarksController } from './bookmarks';
import type { ReaderBookmarkIdentity } from './bookmark-store';
import type { ReaderPublicationCandidate } from './publication';
import {
  mountReaderPublicationWithSearchHarness,
  mountReaderShellWithSearchHarness,
  type ReaderSearchHarnessHandle,
} from './search-harness';
import type { ReaderOpenOptions, Unsubscribe } from './types';

export interface ReaderBookmarksHarnessHandle extends ReaderSearchHarnessHandle {
  bookmarks: ReaderBookmarksController;
}

function attachBookmarks(
  base: ReaderSearchHarnessHandle,
  identity: ReaderBookmarkIdentity,
): ReaderBookmarksHarnessHandle {
  const bookmarks = new ReaderBookmarksController(base.controller, base.shell, { identity });
  const cleanups: Unsubscribe[] = [];
  let destroyed = false;

  cleanups.push(bookmarks.subscribe((state) => {
    if (state.open) {
      base.search.close(false);
      base.toc.close(false);
    }
  }));
  cleanups.push(base.search.subscribe((state) => {
    if (state.open) bookmarks.close(false);
  }));
  cleanups.push(base.toc.subscribe((state) => {
    if (state.open) bookmarks.close(false);
  }));
  bookmarks.start();

  return {
    ...base,
    bookmarks,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups) cleanup();
      bookmarks.destroy();
      base.destroy();
    },
  };
}

/** Non-public fixture harness with P13 TOC, P18 search, and P19 CFI bookmarks. */
export async function mountReaderShellWithBookmarksHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  identity: ReaderBookmarkIdentity,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderBookmarksHarnessHandle> {
  const base = await mountReaderShellWithSearchHarness(root, source, options, target, identity);
  return attachBookmarks(base, identity);
}

/** Generic publication-aware staged reader with exact-release native bookmarks. */
export async function mountReaderPublicationWithBookmarksHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderBookmarksHarnessHandle> {
  const base = await mountReaderPublicationWithSearchHarness(root, publication, options, target);
  return attachBookmarks(base, {
    workId: publication.workId,
    edition: publication.edition,
    releaseVersion: publication.version,
  });
}
