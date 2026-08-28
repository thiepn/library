import { getProgress, getReaderProgress, subscribeLibraryState } from '../client/library-db';
import { getPdfProgress, subscribePdfReaderState } from '../pdf-reader/state';
import type { PdfReaderIdentity } from '../pdf-reader/canonical';
import {
  createReadingContinuitySnapshot,
  type ReadingContinuitySnapshot,
  type ReadingEntryState,
} from './continuity';

export interface HostedReadingContinuityRequest {
  workId: string;
  edition: number;
  releaseVersion: string;
  epubHref?: string;
  pdfHref?: string;
  webHref?: string;
}

function validIdentity(request: HostedReadingContinuityRequest): PdfReaderIdentity | undefined {
  if (!request.releaseVersion || !Number.isFinite(request.edition)) return undefined;
  return {
    workId: request.workId,
    edition: request.edition,
    releaseVersion: request.releaseVersion,
  };
}

export async function getHostedReadingContinuity(
  request: HostedReadingContinuityRequest,
): Promise<ReadingContinuitySnapshot> {
  const identity = validIdentity(request);
  const [epubProgress, pdfProgress, webProgress] = await Promise.all([
    request.epubHref
      ? getReaderProgress(request.workId).catch(() => undefined)
      : Promise.resolve(undefined),
    request.pdfHref && identity
      ? getPdfProgress(identity).catch(() => undefined)
      : Promise.resolve(undefined),
    request.webHref
      ? getProgress(request.workId).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const entries: ReadingEntryState[] = [];

  if (request.epubHref) {
    const exact = epubProgress
      && identity
      && epubProgress.edition === identity.edition
      && epubProgress.releaseVersion === identity.releaseVersion
      ? epubProgress
      : undefined;
    entries.push({
      format: 'epub',
      href: request.epubHref,
      current: exact?.percentage ?? 0,
      furthest: exact?.furthestPercentage ?? 0,
      ...(exact?.updatedAt ? { updatedAt: exact.updatedAt } : {}),
      ...(exact?.chapterLabel ? { chapterLabel: exact.chapterLabel } : {}),
    });
  }

  if (request.pdfHref) {
    const pageCount = pdfProgress?.pageCount ?? 0;
    entries.push({
      format: 'pdf',
      href: request.pdfHref,
      current: pageCount ? (pdfProgress?.page ?? 0) / pageCount : 0,
      furthest: pageCount ? (pdfProgress?.furthestPage ?? 0) / pageCount : 0,
      ...(pdfProgress?.updatedAt ? { updatedAt: pdfProgress.updatedAt } : {}),
      ...(pdfProgress?.page ? { page: pdfProgress.page } : {}),
      ...(pageCount ? { pageCount } : {}),
    });
  }

  // Legacy Markdown continuity remains a distinct format. It is included only when
  // the work does not have an active native EPUB entry, so old web progress cannot
  // silently override a current release-bound EPUB position.
  if (request.webHref && !request.epubHref) {
    entries.push({
      format: 'web',
      href: request.webHref,
      current: Math.min(1, Math.max(0, (webProgress?.percent ?? 0) / 100)),
      furthest: Math.min(1, Math.max(0, (webProgress?.percent ?? 0) / 100)),
      ...(webProgress?.updatedAt ? { updatedAt: webProgress.updatedAt } : {}),
    });
  }

  return createReadingContinuitySnapshot(entries);
}

export function subscribeUnifiedReadingState(listener: () => void): () => void {
  const unsubscribeLibrary = subscribeLibraryState(listener);
  const unsubscribePdf = subscribePdfReaderState(listener);
  return () => {
    unsubscribeLibrary();
    unsubscribePdf();
  };
}
