import { openLibraryDb } from '../client/library-db';
import type { Unsubscribe } from './types';

const CHANNEL = 'thiepn-library';
export const READER_BOOKMARK_SCHEMA_VERSION = 2 as const;

export interface ReaderBookmarkIdentity {
  workId: string;
  edition: number;
  releaseVersion: string;
}

export interface ReaderBookmarkRecordV2 extends ReaderBookmarkIdentity {
  schemaVersion: typeof READER_BOOKMARK_SCHEMA_VERSION;
  id: string;
  cfi: string;
  href: string;
  chapterLabel: string;
  spineIndex: number;
  percentage?: number;
  createdAt: string;
  updatedAt: string;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('Bookmark storage request failed')));
  });
}

async function withBookmarkStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openLibraryDb();
  try {
    if (!db.objectStoreNames.contains('bookmarks')) throw new Error('Library bookmark storage is unavailable.');
    const transaction = db.transaction('bookmarks', mode);
    const value = await operation(transaction.objectStore('bookmarks'));
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Bookmark transaction aborted')));
      transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Bookmark transaction failed')));
    });
    return value;
  } finally {
    db.close();
  }
}

function broadcastBookmarks(workId: string): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ kind: 'bookmarks', workId, at: Date.now() });
    channel.close();
  } catch {
    // Cross-tab bookmark refresh is best-effort. IndexedDB remains authoritative.
  }
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function isReaderBookmarkRecordV2(value: unknown): value is ReaderBookmarkRecordV2 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ReaderBookmarkRecordV2>;
  return record.schemaVersion === READER_BOOKMARK_SCHEMA_VERSION
    && typeof record.id === 'string'
    && record.id.length > 0
    && typeof record.workId === 'string'
    && record.workId.length > 0
    && typeof record.edition === 'number'
    && Number.isFinite(record.edition)
    && typeof record.releaseVersion === 'string'
    && record.releaseVersion.length > 0
    && typeof record.cfi === 'string'
    && record.cfi.startsWith('epubcfi(')
    && typeof record.href === 'string'
    && typeof record.chapterLabel === 'string'
    && typeof record.spineIndex === 'number'
    && Number.isFinite(record.spineIndex)
    && (record.percentage === undefined || (typeof record.percentage === 'number' && Number.isFinite(record.percentage)))
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

function sanitizeBookmark(record: ReaderBookmarkRecordV2): ReaderBookmarkRecordV2 {
  return {
    ...record,
    schemaVersion: READER_BOOKMARK_SCHEMA_VERSION,
    spineIndex: Math.max(0, Math.round(record.spineIndex)),
    ...(record.percentage === undefined ? {} : { percentage: clampPercentage(record.percentage) }),
  };
}

export async function getReaderBookmarksForWork(workId: string): Promise<ReaderBookmarkRecordV2[]> {
  const records = await withBookmarkStore('readonly', async (store) => request<unknown[]>(store.getAll()));
  return records
    .filter(isReaderBookmarkRecordV2)
    .filter((record) => record.workId === workId)
    .map(sanitizeBookmark)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function putReaderBookmark(record: ReaderBookmarkRecordV2): Promise<void> {
  if (!isReaderBookmarkRecordV2(record)) throw new Error('Invalid native EPUB bookmark record.');
  const next = sanitizeBookmark(record);
  await withBookmarkStore('readwrite', async (store) => {
    await request(store.put(next));
  });
  broadcastBookmarks(next.workId);
}

export async function deleteReaderBookmark(id: string, workId: string): Promise<void> {
  if (!id) return;
  await withBookmarkStore('readwrite', async (store) => {
    await request(store.delete(id));
  });
  broadcastBookmarks(workId);
}

export function subscribeReaderBookmarkChanges(workId: string, listener: () => void): Unsubscribe {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'object' || event.data === null) return;
      const data = event.data as { kind?: unknown; workId?: unknown };
      if (data.kind === 'bookmarks' && (data.workId === undefined || data.workId === workId)) listener();
    });
  } catch {
    // Reading and same-tab bookmarks remain available without BroadcastChannel support.
  }
  return () => channel?.close();
}
