import { pdfReaderIdentityKey, type PdfReaderIdentity } from './canonical';

const DB_NAME = 'thiepn-library-pdf-reader';
const DB_VERSION = 2;
const PROGRESS_STORE = 'progress';
const BOOKMARK_STORE = 'bookmarks';
const ANNOTATION_STORE = 'annotations';
const CHANNEL = 'thiepn-library-pdf-reader';
const SETTINGS_KEY = 'thiepn-library-pdf-settings-v1';

export type PdfFitMode = 'width' | 'page' | 'custom';

export interface PdfReaderSettings {
  schemaVersion: 1;
  fit: PdfFitMode;
  zoom: number;
}

export interface PdfProgressRecord {
  schemaVersion: 1;
  id: string;
  identity: PdfReaderIdentity;
  page: number;
  furthestPage: number;
  pageCount: number;
  updatedAt: string;
}

export interface PdfBookmarkRecord {
  schemaVersion: 1;
  id: string;
  publicationKey: string;
  identity: PdfReaderIdentity;
  page: number;
  label: string;
  createdAt: string;
}

export interface PdfAnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfAnnotationRecord {
  schemaVersion: 1;
  id: string;
  publicationKey: string;
  identity: PdfReaderIdentity;
  page: number;
  quote: string;
  note: string;
  rects: PdfAnnotationRect[];
  createdAt: string;
  updatedAt: string;
}

export interface PdfReaderStateSnapshotV1 {
  schemaVersion: 1;
  progress: PdfProgressRecord[];
  bookmarks: PdfBookmarkRecord[];
  annotations: PdfAnnotationRecord[];
  settings: PdfReaderSettings;
}

export type PdfReaderStatePatchV1 = Partial<Omit<PdfReaderStateSnapshotV1, 'schemaVersion'>>;

const DEFAULT_SETTINGS: PdfReaderSettings = {
  schemaVersion: 1,
  fit: 'width',
  zoom: 1,
};

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('PDF reader storage request failed.')));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('PDF reader storage transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('PDF reader storage transaction failed.')), { once: true });
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.addEventListener('upgradeneeded', () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) db.createObjectStore(PROGRESS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BOOKMARK_STORE)) {
        const store = db.createObjectStore(BOOKMARK_STORE, { keyPath: 'id' });
        store.createIndex('publicationKey', 'publicationKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(ANNOTATION_STORE)) {
        const store = db.createObjectStore(ANNOTATION_STORE, { keyPath: 'id' });
        store.createIndex('publicationKey', 'publicationKey', { unique: false });
      }
    });
    open.addEventListener('success', () => resolve(open.result));
    open.addEventListener('error', () => reject(open.error ?? new Error('Unable to open PDF reader storage.')));
    open.addEventListener('blocked', () => reject(new Error('PDF reader storage upgrade is blocked by another tab.')));
  });
}

async function withStore<T>(
  storeName: typeof PROGRESS_STORE | typeof BOOKMARK_STORE | typeof ANNOTATION_STORE,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const transaction = db.transaction(storeName, mode);
    const result = await operation(transaction.objectStore(storeName));
    await transactionCompletion(transaction);
    return result;
  } finally {
    db.close();
  }
}

function broadcast(kind: string, identity: PdfReaderIdentity) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ kind, publicationKey: pdfReaderIdentityKey(identity), at: Date.now() });
    channel.close();
  } catch {
    // IndexedDB remains authoritative; cross-tab invalidation is best-effort.
  }
}

function broadcastRestore(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ kind: 'restore', at: Date.now() });
    channel.close();
  } catch {
    // IndexedDB remains authoritative; cross-tab invalidation is best-effort.
  }
}

export function subscribePdfReaderState(listener: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', listener);
  } catch {
    // Same-tab updates still render through direct callers.
  }
  return () => channel?.close();
}

function sameIdentity(a: PdfReaderIdentity, b: PdfReaderIdentity): boolean {
  return a.workId === b.workId && a.edition === b.edition && a.releaseVersion === b.releaseVersion;
}

function isPdfIdentity(value: unknown): value is PdfReaderIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const identity = value as Partial<PdfReaderIdentity>;
  return typeof identity.workId === 'string' && identity.workId.length > 0
    && typeof identity.edition === 'number' && Number.isFinite(identity.edition)
    && typeof identity.releaseVersion === 'string';
}

function validPage(value: number, pageCount: number): number {
  return Math.min(Math.max(1, Math.round(Number.isFinite(value) ? value : 1)), Math.max(1, pageCount));
}

export function isPdfReaderSettings(value: unknown): value is PdfReaderSettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Partial<PdfReaderSettings>;
  return settings.schemaVersion === 1
    && (settings.fit === 'width' || settings.fit === 'page' || settings.fit === 'custom')
    && typeof settings.zoom === 'number' && Number.isFinite(settings.zoom)
    && settings.zoom >= 0.5 && settings.zoom <= 3;
}

export function isPdfProgressRecord(value: unknown): value is PdfProgressRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<PdfProgressRecord>;
  return record.schemaVersion === 1
    && typeof record.id === 'string' && record.id.length > 0
    && isPdfIdentity(record.identity)
    && typeof record.page === 'number' && Number.isFinite(record.page)
    && typeof record.furthestPage === 'number' && Number.isFinite(record.furthestPage)
    && typeof record.pageCount === 'number' && Number.isFinite(record.pageCount) && record.pageCount >= 1
    && typeof record.updatedAt === 'string';
}

export function isPdfBookmarkRecord(value: unknown): value is PdfBookmarkRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<PdfBookmarkRecord>;
  return record.schemaVersion === 1
    && typeof record.id === 'string' && record.id.length > 0
    && typeof record.publicationKey === 'string' && record.publicationKey.length > 0
    && isPdfIdentity(record.identity)
    && typeof record.page === 'number' && Number.isFinite(record.page) && record.page >= 1
    && typeof record.label === 'string'
    && typeof record.createdAt === 'string';
}

export function isPdfAnnotationRecord(value: unknown): value is PdfAnnotationRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<PdfAnnotationRecord>;
  return record.schemaVersion === 1
    && typeof record.id === 'string' && record.id.length > 0
    && typeof record.publicationKey === 'string' && record.publicationKey.length > 0
    && isPdfIdentity(record.identity)
    && typeof record.page === 'number' && Number.isFinite(record.page) && record.page >= 1
    && typeof record.quote === 'string' && record.quote.trim().length > 0 && record.quote.length <= 2400
    && typeof record.note === 'string' && record.note.length <= 5000
    && Array.isArray(record.rects) && record.rects.length <= 64
    && record.rects.every((rect) => typeof rect === 'object' && rect !== null
      && typeof rect.x === 'number' && Number.isFinite(rect.x) && rect.x >= 0 && rect.x <= 1
      && typeof rect.y === 'number' && Number.isFinite(rect.y) && rect.y >= 0 && rect.y <= 1
      && typeof rect.width === 'number' && Number.isFinite(rect.width) && rect.width > 0 && rect.width <= 1
      && typeof rect.height === 'number' && Number.isFinite(rect.height) && rect.height > 0 && rect.height <= 1)
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

export async function getPdfProgress(identity: PdfReaderIdentity): Promise<PdfProgressRecord | undefined> {
  const id = pdfReaderIdentityKey(identity);
  return withStore(PROGRESS_STORE, 'readonly', async (store) => {
    const value = await request<PdfProgressRecord | undefined>(store.get(id));
    if (!value || !isPdfProgressRecord(value) || !sameIdentity(value.identity, identity)) return undefined;
    const pageCount = Math.max(1, Math.round(value.pageCount || 1));
    const page = validPage(value.page, pageCount);
    return { ...value, page, furthestPage: Math.max(page, validPage(value.furthestPage, pageCount)), pageCount };
  });
}

export async function setPdfProgress(identity: PdfReaderIdentity, page: number, pageCount: number): Promise<PdfProgressRecord> {
  const id = pdfReaderIdentityKey(identity);
  const boundedCount = Math.max(1, Math.round(pageCount));
  const boundedPage = validPage(page, boundedCount);
  let next: PdfProgressRecord = {
    schemaVersion: 1,
    id,
    identity,
    page: boundedPage,
    furthestPage: boundedPage,
    pageCount: boundedCount,
    updatedAt: new Date().toISOString(),
  };
  await withStore(PROGRESS_STORE, 'readwrite', async (store) => {
    const previous = await request<PdfProgressRecord | undefined>(store.get(id));
    if (previous && isPdfProgressRecord(previous) && sameIdentity(previous.identity, identity)) {
      next.furthestPage = Math.max(boundedPage, validPage(previous.furthestPage, boundedCount));
    }
    await request(store.put(next));
  });
  broadcast('progress', identity);
  return next;
}

export async function getPdfBookmarks(identity?: PdfReaderIdentity): Promise<PdfBookmarkRecord[]> {
  if (identity) {
    const publicationKey = pdfReaderIdentityKey(identity);
    return withStore(BOOKMARK_STORE, 'readonly', async (store) => {
      const index = store.index('publicationKey');
      const values = await request<unknown[]>(index.getAll(publicationKey));
      return values.filter(isPdfBookmarkRecord)
        .filter((value) => sameIdentity(value.identity, identity))
        .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
    });
  }
  return withStore(BOOKMARK_STORE, 'readonly', async (store) => {
    const values = await request<unknown[]>(store.getAll());
    return values.filter(isPdfBookmarkRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export async function deletePdfBookmark(id: string, identity: PdfReaderIdentity): Promise<void> {
  if (!id) return;
  await withStore(BOOKMARK_STORE, 'readwrite', async (store) => {
    await request(store.delete(id));
  });
  broadcast('bookmarks', identity);
}

export async function togglePdfBookmark(
  identity: PdfReaderIdentity,
  page: number,
  label = `Page ${page}`,
): Promise<{ bookmarked: boolean; bookmarks: PdfBookmarkRecord[] }> {
  const publicationKey = pdfReaderIdentityKey(identity);
  const id = `${publicationKey}::page:${page}`;
  let bookmarked = false;
  await withStore(BOOKMARK_STORE, 'readwrite', async (store) => {
    const existing = await request<PdfBookmarkRecord | undefined>(store.get(id));
    if (existing) {
      await request(store.delete(id));
      bookmarked = false;
      return;
    }
    const record: PdfBookmarkRecord = {
      schemaVersion: 1,
      id,
      publicationKey,
      identity,
      page,
      label,
      createdAt: new Date().toISOString(),
    };
    await request(store.put(record));
    bookmarked = true;
  });
  broadcast('bookmarks', identity);
  return { bookmarked, bookmarks: await getPdfBookmarks(identity) };
}

export async function getPdfAnnotations(identity?: PdfReaderIdentity): Promise<PdfAnnotationRecord[]> {
  if (identity) {
    const publicationKey = pdfReaderIdentityKey(identity);
    return withStore(ANNOTATION_STORE, 'readonly', async (store) => {
      const index = store.index('publicationKey');
      const values = await request<unknown[]>(index.getAll(publicationKey));
      return values.filter(isPdfAnnotationRecord)
        .filter((value) => sameIdentity(value.identity, identity))
        .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
    });
  }
  return withStore(ANNOTATION_STORE, 'readonly', async (store) => {
    const values = await request<unknown[]>(store.getAll());
    return values.filter(isPdfAnnotationRecord).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export async function putPdfAnnotation(record: PdfAnnotationRecord): Promise<void> {
  if (!isPdfAnnotationRecord(record)) throw new Error('Invalid PDF annotation record.');
  if (record.publicationKey !== pdfReaderIdentityKey(record.identity)) throw new Error('PDF annotation identity mismatch.');
  await withStore(ANNOTATION_STORE, 'readwrite', async (store) => {
    await request(store.put(record));
  });
  broadcast('annotations', record.identity);
}

export async function deletePdfAnnotation(id: string, identity: PdfReaderIdentity): Promise<void> {
  await withStore(ANNOTATION_STORE, 'readwrite', async (store) => {
    await request(store.delete(id));
  });
  broadcast('annotations', identity);
}

export function getPdfReaderSettings(): PdfReaderSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as unknown;
    if (!isPdfReaderSettings(parsed)) return { ...DEFAULT_SETTINGS };
    return { schemaVersion: 1, fit: parsed.fit, zoom: parsed.zoom };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setPdfReaderSettings(settings: PdfReaderSettings): void {
  try {
    replacePdfReaderSettings(settings);
  } catch {
    // Settings persistence is optional; reading remains available in this session.
  }
}

/** RR8 strict writer: unlike ordinary preference persistence, restore failures must propagate. */
export function replacePdfReaderSettings(settings: PdfReaderSettings): void {
  if (!isPdfReaderSettings(settings)) throw new Error('Invalid PDF reader settings.');
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getPdfReaderStateSnapshot(): Promise<PdfReaderStateSnapshotV1> {
  const db = await openDb();
  try {
    const transaction = db.transaction([PROGRESS_STORE, BOOKMARK_STORE, ANNOTATION_STORE], 'readonly');
    const completion = transactionCompletion(transaction);
    const [progressValues, bookmarkValues, annotationValues] = await Promise.all([
      request<unknown[]>(transaction.objectStore(PROGRESS_STORE).getAll()),
      request<unknown[]>(transaction.objectStore(BOOKMARK_STORE).getAll()),
      request<unknown[]>(transaction.objectStore(ANNOTATION_STORE).getAll()),
    ]);
    await completion;
    return {
      schemaVersion: 1,
      progress: progressValues.filter(isPdfProgressRecord).sort((a, b) => a.id.localeCompare(b.id)),
      bookmarks: bookmarkValues.filter(isPdfBookmarkRecord).sort((a, b) => a.id.localeCompare(b.id)),
      annotations: annotationValues.filter(isPdfAnnotationRecord).sort((a, b) => a.id.localeCompare(b.id)),
      settings: getPdfReaderSettings(),
    };
  } finally {
    db.close();
  }
}

/** Replace only PDF categories explicitly present; progress/bookmarks share one atomic IDB transaction. */
export async function replacePdfReaderStateSnapshot(patch: PdfReaderStatePatchV1): Promise<void> {
  if (patch.progress && !patch.progress.every(isPdfProgressRecord)) throw new Error('Invalid PDF progress backup records.');
  if (patch.bookmarks && !patch.bookmarks.every(isPdfBookmarkRecord)) throw new Error('Invalid PDF bookmark backup records.');
  if (patch.annotations && !patch.annotations.every(isPdfAnnotationRecord)) throw new Error('Invalid PDF annotation backup records.');
  if (patch.settings && !isPdfReaderSettings(patch.settings)) throw new Error('Invalid PDF settings backup record.');

  if (patch.progress || patch.bookmarks || patch.annotations) {
    const stores = [
      ...(patch.progress ? [PROGRESS_STORE] : []),
      ...(patch.bookmarks ? [BOOKMARK_STORE] : []),
      ...(patch.annotations ? [ANNOTATION_STORE] : []),
    ];
    const db = await openDb();
    try {
      const transaction = db.transaction(stores, 'readwrite');
      const completion = transactionCompletion(transaction);
      const operations: Array<Promise<unknown>> = [];
      if (patch.progress) {
        const store = transaction.objectStore(PROGRESS_STORE);
        operations.push(request(store.clear()));
        for (const record of patch.progress) operations.push(request(store.put(record)));
      }
      if (patch.bookmarks) {
        const store = transaction.objectStore(BOOKMARK_STORE);
        operations.push(request(store.clear()));
        for (const record of patch.bookmarks) operations.push(request(store.put(record)));
      }
      if (patch.annotations) {
        const store = transaction.objectStore(ANNOTATION_STORE);
        operations.push(request(store.clear()));
        for (const record of patch.annotations) operations.push(request(store.put(record)));
      }
      try {
        await Promise.all(operations);
        await completion;
      } catch (error) {
        try { transaction.abort(); } catch {}
        try { await completion; } catch {}
        throw error;
      }
    } finally {
      db.close();
    }
  }

  if (patch.settings) replacePdfReaderSettings(patch.settings);
  broadcastRestore();
}
