export type LibraryStorageFailureKind =
  | 'quota'
  | 'blocked'
  | 'denied'
  | 'aborted'
  | 'unavailable'
  | 'evicted'
  | 'unknown';

export class LibraryStorageError extends Error {
  readonly kind: LibraryStorageFailureKind;
  readonly retryable: boolean;
  readonly sessionOnly: boolean;

  constructor(
    kind: LibraryStorageFailureKind,
    message: string,
    options: { cause?: unknown; retryable?: boolean; sessionOnly?: boolean } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'LibraryStorageError';
    this.kind = kind;
    this.retryable = options.retryable ?? true;
    this.sessionOnly = options.sessionOnly ?? false;
  }
}

function domExceptionName(error: unknown): string | undefined {
  if (error instanceof DOMException) return error.name;
  if (typeof error === 'object' && error !== null && 'name' in error && typeof (error as { name?: unknown }).name === 'string') {
    return (error as { name: string }).name;
  }
  return undefined;
}

export function normalizeLibraryStorageError(error: unknown, context = 'Library storage'): LibraryStorageError {
  if (error instanceof LibraryStorageError) return error;
  const name = domExceptionName(error);

  if (name === 'QuotaExceededError') {
    return new LibraryStorageError(
      'quota',
      `${context} is full. Remove an offline download or unused personal book, then try again.`,
      { cause: error },
    );
  }

  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotAllowedError') {
    return new LibraryStorageError(
      'denied',
      `${context} is unavailable in this browser session. Check site-storage or private-browsing restrictions.`,
      { cause: error, retryable: false, sessionOnly: true },
    );
  }

  if (name === 'AbortError' || name === 'TransactionInactiveError') {
    return new LibraryStorageError(
      'aborted',
      `${context} was interrupted before it could be committed. Existing saved data was left unchanged.`,
      { cause: error },
    );
  }

  if (name === 'UnknownError') {
    return new LibraryStorageError(
      'unavailable',
      `${context} could not be opened. Check browser storage settings and try again outside private browsing if needed.`,
      { cause: error, sessionOnly: true },
    );
  }

  if (error instanceof Error && /blocked by another tab/i.test(error.message)) {
    return new LibraryStorageError(
      'blocked',
      `${context} upgrade is blocked by another Library tab. Close the older tab and retry.`,
      { cause: error },
    );
  }

  return new LibraryStorageError(
    'unknown',
    error instanceof Error && error.message ? error.message : `${context} failed unexpectedly.`,
    { cause: error },
  );
}

export interface LibraryStorageEstimate {
  supported: boolean;
  usageBytes?: number;
  quotaBytes?: number;
  availableBytes?: number;
  persisted?: boolean;
}

export async function getLibraryStorageEstimate(): Promise<LibraryStorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage) return { supported: false };
  try {
    const estimate = navigator.storage.estimate ? await navigator.storage.estimate() : {};
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : undefined;
    const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : undefined;
    const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : undefined;
    const availableBytes = usageBytes !== undefined && quotaBytes !== undefined
      ? Math.max(0, quotaBytes - usageBytes)
      : undefined;
    return {
      supported: true,
      ...(usageBytes !== undefined ? { usageBytes } : {}),
      ...(quotaBytes !== undefined ? { quotaBytes } : {}),
      ...(availableBytes !== undefined ? { availableBytes } : {}),
      ...(persisted !== undefined ? { persisted } : {}),
    };
  } catch {
    return { supported: true };
  }
}
