import type { ReaderShellController } from './shell';
import { ReaderEngineError, type ReaderEngineErrorCode } from './types';

export type ReaderFailureKind =
  | 'network'
  | 'publication'
  | 'rendering'
  | 'location'
  | 'reader'
  | 'unknown';

export interface ReaderFailureDescription {
  kind: ReaderFailureKind;
  heading: string;
  message: string;
  retryable: boolean;
  code?: ReaderEngineErrorCode;
}

export interface ReaderFallbackTargets {
  webHref?: string;
  pdfHref?: string;
  epubHref?: string;
}

const NETWORK_MARKERS = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'connection',
  'offline',
  'status 408',
  'status 429',
  'status 500',
  'status 502',
  'status 503',
  'status 504',
];

function errorChain(error: unknown): unknown[] {
  const values: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current !== undefined && current !== null && !seen.has(current); depth += 1) {
    values.push(current);
    seen.add(current);
    current = current instanceof ReaderEngineError
      ? current.cause
      : current instanceof Error
        ? (current as Error & { cause?: unknown }).cause
        : undefined;
  }

  return values;
}

function findEngineError(error: unknown): ReaderEngineError | undefined {
  return errorChain(error).find((value): value is ReaderEngineError => value instanceof ReaderEngineError);
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return errorChain(error).some((value) => {
    const message = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
    const normalized = message.toLowerCase();
    return NETWORK_MARKERS.some((marker) => normalized.includes(marker));
  });
}

export function describeReaderFailure(error: unknown): ReaderFailureDescription {
  const engineError = findEngineError(error);
  const code = engineError?.code;

  if (isNetworkFailure(error)) {
    return {
      kind: 'network',
      heading: 'The book could not be loaded.',
      message: 'The EPUB could not be loaded. Check your connection and try again, or use another available format.',
      retryable: true,
      ...(code ? { code } : {}),
    };
  }

  if (code === 'epub-open-failed') {
    return {
      kind: 'publication',
      heading: 'This EPUB could not be opened.',
      message: 'This edition could not be opened in the web reader. The active release has not been replaced; try again or use another available format.',
      retryable: true,
      code,
    };
  }

  if (code === 'epub-render-failed') {
    return {
      kind: 'rendering',
      heading: 'This part could not be displayed.',
      message: 'The EPUB opened, but the current reading view could not be rendered. Try again or use another available format.',
      retryable: true,
      code,
    };
  }

  if (code === 'invalid-location') {
    return {
      kind: 'location',
      heading: 'This reading location is unavailable.',
      message: 'The requested EPUB location could not be displayed. Try again; if the problem continues, use another available reading path.',
      retryable: true,
      code,
    };
  }

  if (code === 'invalid-container' || code === 'engine-not-ready') {
    return {
      kind: 'reader',
      heading: 'The web reader could not initialize.',
      message: 'The reader could not initialize correctly. Try again, or return to the book page and use another available format.',
      retryable: code !== 'invalid-container',
      code,
    };
  }

  return {
    kind: 'unknown',
    heading: 'The reader hit a problem.',
    message: 'The web reader could not continue. Try again, or use another available reading format.',
    retryable: true,
  };
}

export function clearReaderFailureState(shell: ReaderShellController): void {
  delete shell.root.dataset.readerFailureKind;
  delete shell.root.dataset.readerFailureCode;
  delete shell.root.dataset.readerFailureRetryable;

  const heading = shell.root.querySelector<HTMLElement>('[data-reader-error-heading]');
  const retry = shell.root.querySelector<HTMLButtonElement>('[data-reader-command="retry"]');
  if (heading) heading.textContent = 'We couldn’t continue in the reader.';
  if (retry) {
    retry.hidden = false;
    retry.disabled = false;
    retry.textContent = 'Try again';
  }
}

export function setReaderFailureState(
  shell: ReaderShellController,
  error: unknown,
): ReaderFailureDescription {
  const failure = describeReaderFailure(error);
  shell.root.dataset.readerFailureKind = failure.kind;
  shell.root.dataset.readerFailureRetryable = String(failure.retryable);
  if (failure.code) shell.root.dataset.readerFailureCode = failure.code;
  else delete shell.root.dataset.readerFailureCode;

  const heading = shell.root.querySelector<HTMLElement>('[data-reader-error-heading]');
  const retry = shell.root.querySelector<HTMLButtonElement>('[data-reader-command="retry"]');
  if (heading) heading.textContent = failure.heading;
  if (retry) {
    retry.hidden = !failure.retryable;
    retry.disabled = false;
    retry.textContent = 'Try again';
  }
  shell.setStatus('error', failure.message);
  return failure;
}
