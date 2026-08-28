import { pdfReaderIdentityKey, type PdfReaderIdentity } from './canonical';

const DB_NAME = 'thiepn-library-pdf-reader';
const DB_VERSION = 1;
const PROGRESS_STORE = 'progress';
const BOOKMARK_STORE = 'bookmarks';
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
    });
    open.addEventListener('success', () => resolve(open.result));
    open.addEventListener('error', () => reject(open.error ?? new Error('Unable to open PDF reader storage.')));
    open.addEventListener('blocked', () => reject(new Error('PDF reader storage upgrade is blocked by another tab.')));
  });
}

async function withStore<T>(
  storeName: typeof PROGRESS_STORE | typeof BOOKMARK_STORE,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const transaction = db.transaction(storeName, mode);
    const result = await operation(transaction.objectStore(storeName));
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('PDF reader storage transaction aborted.')));
      transaction.addEventListener('error', () => reject(transaction.error ?? new Error('PDF reader storage transaction failed.')));
    });
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

function sameIdentity(a: PdfReaderIdentity, b: PdfReaderIdentity): boolean {
  return a.workId === b.workId && a.edition === b.edition && a.releaseVersion === b.releaseVersion;
}

function validPage(value: number, pageCount: number): number {
  return Math.min(Math.max(1, Math.round(Number.isFinite(value) ? value : 1)), Math.max(1, pageCount));
}

export async function getPdfProgress(identity: PdfReaderIdentity): Promise<PdfProgressRecord | undefined> {
  const id = pdfReaderIdentityKey(identity);
  return withStore(PROGRESS_STORE, 'readonly', async (store) => {
    const value = await request<PdfProgressRecord | undefined>(store.get(id));
    if (!value || value.schemaVersion !== 1 || !sameIdentity(value.identity, identity)) return undefined;
    const pageCount = Math.max(1, Math.round(value.pageCount || 1));
    const page = validPage(value.page, pageCount);
    return {
      ...value,
      page,
      furthestPage: Math.max(page, validPage(value.furthestPage, pageCount)),
      pageCount,
    };
  });
}

export async function setPdfProgress(
  identity: PdfReaderIdentity,
  page: number,
  pageCount: number,
): Promise<PdfProgressRecord> {
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
    if (previous?.schemaVersion === 1 && sameIdentity(previous.identity, identity)) {
      next.furthestPage = Math.max(boundedPage, validPage(previous.furthestPage, boundedCount));
    }
    await request(store.put(next));
  });
  broadcast('progress', identity);
  return next;
}

export async function getPdfBookmarks(identity: PdfReaderIdentity): Promise<PdfBookmarkRecord[]> {
  const publicationKey = pdfReaderIdentityKey(identity);
  return withStore(BOOKMARK_STORE, 'readonly', async (store) => {
    const index = store.index('publicationKey');
    const values = await request<PdfBookmarkRecord[]>(index.getAll(publicationKey));
    return values
      .filter((value) => value.schemaVersion === 1 && sameIdentity(value.identity, identity))
      .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
  });
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

export function getPdfReaderSettings(): PdfReaderSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<PdfReaderSettings> | null;
    if (!parsed || parsed.schemaVersion !== 1) return { ...DEFAULT_SETTINGS };
    const fit: PdfFitMode = parsed.fit === 'page' || parsed.fit === 'custom' ? parsed.fit : 'width';
    const zoom = Math.min(3, Math.max(0.5, Number.isFinite(parsed.zoom) ? Number(parsed.zoom) : 1));
    return { schemaVersion: 1, fit, zoom };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setPdfReaderSettings(settings: PdfReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      schemaVersion: 1,
      fit: settings.fit,
      zoom: Math.min(3, Math.max(0.5, settings.zoom)),
    } satisfies PdfReaderSettings));
  } catch {
    // Settings persistence is optional; reading remains available in this session.
  }
}
