import { openLibraryDb } from '../client/library-db';
import type { Unsubscribe } from './types';

const CHANNEL = 'thiepn-library';
export const READER_ANNOTATION_SCHEMA_VERSION = 2 as const;
export const READER_ANNOTATION_MAX_QUOTE = 2400;
export const READER_ANNOTATION_MAX_NOTE = 5000;

export interface ReaderAnnotationIdentity {
  workId: string;
  edition: number;
  releaseVersion: string;
}

export interface ReaderAnnotationRecordV2 extends ReaderAnnotationIdentity {
  schemaVersion: typeof READER_ANNOTATION_SCHEMA_VERSION;
  id: string;
  cfiRange: string;
  href: string;
  chapterLabel: string;
  spineIndex: number;
  percentage?: number;
  quote: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('Annotation storage request failed')));
  });
}

async function withAnnotationStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openLibraryDb();
  try {
    if (!db.objectStoreNames.contains('annotations')) throw new Error('Library annotation storage is unavailable.');
    const transaction = db.transaction('annotations', mode);
    const value = await operation(transaction.objectStore('annotations'));
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Annotation transaction aborted')));
      transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Annotation transaction failed')));
    });
    return value;
  } finally {
    db.close();
  }
}

function broadcastAnnotations(workId: string): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ kind: 'annotations', workId, at: Date.now() });
    channel.close();
  } catch {
    // Cross-tab annotation refresh is best-effort. IndexedDB remains authoritative.
  }
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function isReaderAnnotationRecordV2(value: unknown): value is ReaderAnnotationRecordV2 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ReaderAnnotationRecordV2>;
  return record.schemaVersion === READER_ANNOTATION_SCHEMA_VERSION
    && typeof record.id === 'string'
    && record.id.length > 0
    && typeof record.workId === 'string'
    && record.workId.length > 0
    && typeof record.edition === 'number'
    && Number.isFinite(record.edition)
    && typeof record.releaseVersion === 'string'
    && record.releaseVersion.length > 0
    && typeof record.cfiRange === 'string'
    && record.cfiRange.startsWith('epubcfi(')
    && typeof record.href === 'string'
    && typeof record.chapterLabel === 'string'
    && typeof record.spineIndex === 'number'
    && Number.isFinite(record.spineIndex)
    && (record.percentage === undefined || (typeof record.percentage === 'number' && Number.isFinite(record.percentage)))
    && typeof record.quote === 'string'
    && record.quote.trim().length > 0
    && typeof record.note === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

function sanitizeAnnotation(record: ReaderAnnotationRecordV2): ReaderAnnotationRecordV2 {
  return {
    ...record,
    schemaVersion: READER_ANNOTATION_SCHEMA_VERSION,
    spineIndex: Math.max(0, Math.round(record.spineIndex)),
    quote: record.quote.trim().slice(0, READER_ANNOTATION_MAX_QUOTE),
    note: record.note.slice(0, READER_ANNOTATION_MAX_NOTE),
    ...(record.percentage === undefined ? {} : { percentage: clampPercentage(record.percentage) }),
  };
}

export async function getReaderAnnotationsForWork(workId: string): Promise<ReaderAnnotationRecordV2[]> {
  const records = await withAnnotationStore('readonly', async (store) => request<unknown[]>(store.getAll()));
  return records
    .filter(isReaderAnnotationRecordV2)
    .filter((record) => record.workId === workId)
    .map(sanitizeAnnotation)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putReaderAnnotation(record: ReaderAnnotationRecordV2): Promise<void> {
  if (!isReaderAnnotationRecordV2(record)) throw new Error('Invalid native EPUB annotation record.');
  const next = sanitizeAnnotation(record);
  await withAnnotationStore('readwrite', async (store) => {
    await request(store.put(next));
  });
  broadcastAnnotations(next.workId);
}

export async function deleteReaderAnnotation(id: string, workId: string): Promise<void> {
  if (!id) return;
  await withAnnotationStore('readwrite', async (store) => {
    await request(store.delete(id));
  });
  broadcastAnnotations(workId);
}

export function subscribeReaderAnnotationChanges(workId: string, listener: () => void): Unsubscribe {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'object' || event.data === null) return;
      const data = event.data as { kind?: unknown; workId?: unknown };
      if (data.kind === 'annotations' && (data.workId === undefined || data.workId === workId)) listener();
    });
  } catch {
    // Same-tab annotations remain available without BroadcastChannel support.
  }
  return () => channel?.close();
}
