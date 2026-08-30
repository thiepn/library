import { openLibraryDb } from '../client/library-db';
import { pdfReaderIdentityKey, type PdfReaderIdentity } from './canonical';

const LEGACY_DB_NAME = 'thiepn-library-pdf-reader';
const LEGACY_DB_VERSION = 1;
const LEGACY_PROGRESS_STORE = 'progress';
const LEGACY_BOOKMARK_STORE = 'bookmarks';
const PROGRESS_STORE = 'pdfProgress';
const BOOKMARK_STORE = 'pdfBookmarks';
const CHANNEL = 'thiepn-library-pdf-reader';
export const PDF_SETTINGS_KEY = 'thiepn-library-pdf-settings-v1';
export const PDF_SETTINGS_SCHEMA_VERSION = 1 as const;

export type PdfFitMode = 'width' | 'page' | 'custom';

export interface PdfReaderSettings {
  schemaVersion: typeof PDF_SETTINGS_SCHEMA_VERSION;
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

export interface PdfPortableState {
  progress: PdfProgressRecord[];
  bookmarks: PdfBookmarkRecord[];
}

const DEFAULT_SETTINGS: PdfReaderSettings = {
  schemaVersion: PDF_SETTINGS_SCHEMA_VERSION,
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

async function withMainStore<T>(
  storeName: typeof PROGRESS_STORE | typeof BOOKMARK_STORE,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openLibraryDb();
  try {
    if (!db.objectStoreNames.contains(storeName)) throw new Error('Portable PDF reader storage is unavailable.');
    const transaction = db.transaction(storeName, mode);
    const completion = transactionCompletion(transaction);
    const value = await operation(transaction.objectStore(storeName));
    await completion;
    return value;
  } finally {
    db.close();
  }
}

async function legacyDatabaseExists(): Promise<boolean | undefined> {
  try {
    if (typeof indexedDB.databases !== 'function') return undefined;
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === LEGACY_DB_NAME);
  } catch {
    return undefined;
  }
}

async function openLegacyDbIfPresent(): Promise<IDBDatabase | undefined> {
  const exists = await legacyDatabaseExists();
  if (exists === false) return undefined;
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
    let created = false;
    open.addEventListener('upgradeneeded', () => {
      created = true;
      const db = open.result;
      if (!db.objectStoreNames.contains(LEGACY_PROGRESS_STORE)) db.createObjectStore(LEGACY_PROGRESS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(LEGACY_BOOKMARK_STORE)) {
        const store = db.createObjectStore(LEGACY_BOOKMARK_STORE, { keyPath: 'id' });
        store.createIndex('publicationKey', 'publicationKey', { unique: false });
      }
    });
    open.addEventListener('success', () => {
      const db = open.result;
      db.addEventListener('versionchange', () => db.close());
      if (created && exists !== true) {
        db.close();
        resolve(undefined);
        return;
      }
      resolve(db);
    });
    open.addEventListener('error', () => reject(open.error ?? new Error('Unable to open legacy PDF reader storage.')));
    open.addEventListener('blocked', () => reject(new Error('Legacy PDF reader storage is blocked by another tab.')));
  });
}

async function withLegacyStore<T>(
  storeName: typeof LEGACY_PROGRESS_STORE | typeof LEGACY_BOOKMARK_STORE,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T | undefined> {
  const db = await openLegacyDbIfPresent();
  if (!db) return undefined;
  try {
    if (!db.objectStoreNames.contains(storeName)) return undefined;
    const transaction = db.transaction(storeName, 'readonly');
    const completion = transactionCompletion(transaction);
    const value = await operation(transaction.objectStore(storeName));
    await completion;
    return value;
  } finally {
    db.close();
  }
}

function broadcast(kind: string, identity?: PdfReaderIdentity) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ kind, publicationKey: identity ? pdfReaderIdentityKey(identity) : undefined, at: Date.now() });
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

export function isPdfProgressRecord(value: unknown): value is PdfProgressRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<PdfProgressRecord>;
  const identity = record.identity as Partial<PdfReaderIdentity> | undefined;
  return record.schemaVersion === 1
    && typeof record.id === 'string' && record.id.length > 0
    && typeof identity?.workId === 'string' && identity.workId.length > 0
    && typeof identity.edition === 'number' && Number.isFinite(identity.edition)
    && typeof identity.releaseVersion === 'string'
    && typeof record.page === 'number' && Number.isFinite(record.page)
    && typeof record.furthestPage === 'number' && Number.isFinite(record.furthestPage)
    && typeof record.pageCount === 'number' && Number.isFinite(record.pageCount)
    && typeof record.updatedAt === 'string';
}

export function isPdfBookmarkRecord(value: unknown): value is PdfBookmarkRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<PdfBookmarkRecord>;
  const identity = record.identity as Partial<PdfReaderIdentity> | undefined;
  return record.schemaVersion === 1
    && typeof record.id === 'string' && record.id.length > 0
    && typeof record.publicationKey === 'string' && record.publicationKey.length > 0
    && typeof identity?.workId === 'string' && identity.workId.length > 0
    && typeof identity.edition === 'number' && Number.isFinite(identity.edition)
    && typeof identity.releaseVersion === 'string'
    && typeof record.page === 'number' && Number.isFinite(record.page)
    && typeof record.label === 'string'
    && typeof record.createdAt === 'string';
}

function sanitizeProgress(value: PdfProgressRecord): PdfProgressRecord {
  const pageCount = Math.max(1, Math.round(value.pageCount || 1));
  const page = validPage(value.page, pageCount);
  return {
    ...value,
    page,
    furthestPage: Math.max(page, validPage(value.furthestPage, pageCount)),
    pageCount,
  };
}

async function getMainProgress(identity: PdfReaderIdentity): Promise<PdfProgressRecord | undefined> {
  const id = pdfReaderIdentityKey(identity);
  return withMainStore(PROGRESS_STORE, 'readonly', async (store) => {
    const value = await request<unknown>(store.get(id));
    if (!isPdfProgressRecord(value) || !sameIdentity(value.identity, identity)) return undefined;
    return sanitizeProgress(value);
  });
}

async function getLegacyProgress(identity: PdfReaderIdentity): Promise<PdfProgressRecord | undefined> {
  const id = pdfReaderIdentityKey(identity);
  const value = await withLegacyStore(LEGACY_PROGRESS_STORE, (store) => request<unknown>(store.get(id)));
  if (!isPdfProgressRecord(value) || !sameIdentity(value.identity, identity)) return undefined;
  return sanitizeProgress(value);
}

export async function getPdfProgress(identity: PdfReaderIdentity): Promise<PdfProgressRecord | undefined> {
  const current = await getMainProgress(identity);
  if (current) return current;
  const legacy = await getLegacyProgress(identity);
  if (!legacy) return undefined;
  try {
    await withMainStore(PROGRESS_STORE, 'readwrite', async (store) => { await request(store.put(legacy)); });
  } catch {
    // A readable legacy position remains valid for this session even if migration cannot persist.
  }
  return legacy;
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
  await withMainStore(PROGRESS_STORE, 'readwrite', async (store) => {
    const previous = await request<unknown>(store.get(id));
    if (isPdfProgressRecord(previous) && sameIdentity(previous.identity, identity)) {
      next.furthestPage = Math.max(boundedPage, validPage(previous.furthestPage, boundedCount));
    }
    await request(store.put(next));
  });
  broadcast('progress', identity);
  return next;
}

async function getMainBookmarks(identity: PdfReaderIdentity): Promise<PdfBookmarkRecord[]> {
  const publicationKey = pdfReaderIdentityKey(identity);
  return withMainStore(BOOKMARK_STORE, 'readonly', async (store) => {
    const index = store.index('publicationKey');
    const values = await request<unknown[]>(index.getAll(publicationKey));
    return values
      .filter(isPdfBookmarkRecord)
      .filter((value) => sameIdentity(value.identity, identity))
      .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
  });
}

async function getLegacyBookmarks(identity: PdfReaderIdentity): Promise<PdfBookmarkRecord[]> {
  const publicationKey = pdfReaderIdentityKey(identity);
  const values = await withLegacyStore(LEGACY_BOOKMARK_STORE, async (store) => {
    if (!store.indexNames.contains('publicationKey')) return [];
    return request<unknown[]>(store.index('publicationKey').getAll(publicationKey));
  });
  return (values ?? [])
    .filter(isPdfBookmarkRecord)
    .filter((value) => sameIdentity(value.identity, identity))
    .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
}

export async function getPdfBookmarks(identity: PdfReaderIdentity): Promise<PdfBookmarkRecord[]> {
  const current = await getMainBookmarks(identity);
  if (current.length) return current;
  const legacy = await getLegacyBookmarks(identity);
  if (!legacy.length) return [];
  try {
    await withMainStore(BOOKMARK_STORE, 'readwrite', async (store) => {
      for (const bookmark of legacy) await request(store.put(bookmark));
    });
  } catch {
    // Legacy bookmarks remain readable even if the best-effort migration cannot persist.
  }
  return legacy;
}

export async function togglePdfBookmark(
  identity: PdfReaderIdentity,
  page: number,
  label = `Page ${page}`,
): Promise<{ bookmarked: boolean; bookmarks: PdfBookmarkRecord[] }> {
  const publicationKey = pdfReaderIdentityKey(identity);
  const id = `${publicationKey}::page:${page}`;
  let bookmarked = false;
  await withMainStore(BOOKMARK_STORE, 'readwrite', async (store) => {
    const existing = await request<unknown>(store.get(id));
    if (isPdfBookmarkRecord(existing)) {
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

function mergeProgress(records: PdfProgressRecord[]): PdfProgressRecord[] {
  const byId = new Map<string, PdfProgressRecord>();
  for (const record of records) {
    const current = byId.get(record.id);
    if (!current || record.updatedAt > current.updatedAt) byId.set(record.id, sanitizeProgress(record));
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function mergeBookmarks(records: PdfBookmarkRecord[]): PdfBookmarkRecord[] {
  const byId = new Map<string, PdfBookmarkRecord>();
  for (const record of records) if (!byId.has(record.id)) byId.set(record.id, record);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function getAllPdfStateForPortability(): Promise<PdfPortableState> {
  const mainDb = await openLibraryDb();
  let mainProgress: PdfProgressRecord[] = [];
  let mainBookmarks: PdfBookmarkRecord[] = [];
  try {
    const transaction = mainDb.transaction([PROGRESS_STORE, BOOKMARK_STORE], 'readonly');
    const completion = transactionCompletion(transaction);
    const [progressValues, bookmarkValues] = await Promise.all([
      request<unknown[]>(transaction.objectStore(PROGRESS_STORE).getAll()),
      request<unknown[]>(transaction.objectStore(BOOKMARK_STORE).getAll()),
    ]);
    await completion;
    mainProgress = progressValues.filter(isPdfProgressRecord);
    mainBookmarks = bookmarkValues.filter(isPdfBookmarkRecord);
  } finally {
    mainDb.close();
  }

  const legacyProgress = (await withLegacyStore(LEGACY_PROGRESS_STORE, (store) => request<unknown[]>(store.getAll()))) ?? [];
  const legacyBookmarks = (await withLegacyStore(LEGACY_BOOKMARK_STORE, (store) => request<unknown[]>(store.getAll()))) ?? [];
  return {
    progress: mergeProgress([...legacyProgress.filter(isPdfProgressRecord), ...mainProgress]),
    bookmarks: mergeBookmarks([...mainBookmarks, ...legacyBookmarks.filter(isPdfBookmarkRecord)]),
  };
}

export function parsePdfReaderSettings(value: unknown): PdfReaderSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const parsed = value as Partial<PdfReaderSettings>;
  if (parsed.schemaVersion !== PDF_SETTINGS_SCHEMA_VERSION) return null;
  const fit: PdfFitMode | undefined = parsed.fit === 'width' || parsed.fit === 'page' || parsed.fit === 'custom' ? parsed.fit : undefined;
  if (!fit || typeof parsed.zoom !== 'number' || !Number.isFinite(parsed.zoom)) return null;
  return {
    schemaVersion: PDF_SETTINGS_SCHEMA_VERSION,
    fit,
    zoom: Math.min(3, Math.max(0.5, parsed.zoom)),
  };
}

export function getPdfReaderSettings(): PdfReaderSettings {
  try {
    const parsed = parsePdfReaderSettings(JSON.parse(localStorage.getItem(PDF_SETTINGS_KEY) ?? 'null'));
    return parsed ?? { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setPdfReaderSettings(settings: PdfReaderSettings): void {
  const parsed = parsePdfReaderSettings(settings) ?? { ...DEFAULT_SETTINGS };
  try { localStorage.setItem(PDF_SETTINGS_KEY, JSON.stringify(parsed)); } catch {
    // Settings persistence is optional; reading remains available in this session.
  }
}
