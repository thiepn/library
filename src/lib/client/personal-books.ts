import ePub from 'epubjs';
import {
  inspectPublication,
  type PublicationCompatibilityReport,
} from '../publication-compatibility';
import { LibraryStorageError, normalizeLibraryStorageError } from './storage-reliability';

const PERSONAL_DB_NAME = 'thiepn-library-personal-books';
const PERSONAL_DB_VERSION = 3;
const PERSONAL_STORE = 'books';
const PERSONAL_CHANNEL = 'thiepn-library-personal-books';
const PENDING_METADATA_KEY = 'thiepn.library.personal-books.relink.v1';
const MAX_IMPORT_BYTES = 250 * 1024 * 1024;
export const PERSONAL_BOOK_SCHEMA_VERSION = 1 as const;
export const PERSONAL_BOOK_PORTABLE_METADATA_SCHEMA_VERSION = 1 as const;

export type PersonalBookFormat = 'epub' | 'pdf';

export interface PersonalBookRecord {
  schemaVersion: typeof PERSONAL_BOOK_SCHEMA_VERSION;
  id: string;
  format: PersonalBookFormat;
  title: string;
  creator?: string;
  language?: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  importedAt: string;
  updatedAt: string;
  file: Blob;
  cover?: Blob;
  compatibility?: PublicationCompatibilityReport;
}

type StoredPersonalBookRecord = Omit<PersonalBookRecord, 'file'> & {
  file: Blob | ArrayBuffer;
};

export interface PersonalBookSummary extends Omit<PersonalBookRecord, 'file' | 'cover'> {
  cover?: Blob;
}

export interface PersonalBookPortableMetadataV1 {
  schemaVersion: typeof PERSONAL_BOOK_PORTABLE_METADATA_SCHEMA_VERSION;
  id: string;
  format: PersonalBookFormat;
  title: string;
  creator?: string;
  language?: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  importedAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPersonalBookPortableMetadataV1(value: unknown): value is PersonalBookPortableMetadataV1 {
  if (!isRecord(value) || value.schemaVersion !== PERSONAL_BOOK_PORTABLE_METADATA_SCHEMA_VERSION) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && (value.format === 'epub' || value.format === 'pdf')
    && typeof value.title === 'string' && value.title.length > 0
    && (value.creator === undefined || typeof value.creator === 'string')
    && (value.language === undefined || typeof value.language === 'string')
    && typeof value.fileName === 'string' && value.fileName.length > 0
    && typeof value.mimeType === 'string' && value.mimeType.length > 0
    && typeof value.size === 'number' && Number.isFinite(value.size) && value.size > 0
    && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.sha256)
    && typeof value.importedAt === 'string'
    && typeof value.updatedAt === 'string';
}

function portableMetadata(book: Pick<PersonalBookRecord, 'id' | 'format' | 'title' | 'creator' | 'language' | 'fileName' | 'mimeType' | 'size' | 'sha256' | 'importedAt' | 'updatedAt'>): PersonalBookPortableMetadataV1 {
  return {
    schemaVersion: PERSONAL_BOOK_PORTABLE_METADATA_SCHEMA_VERSION,
    id: book.id,
    format: book.format,
    title: book.title,
    ...(book.creator ? { creator: book.creator } : {}),
    ...(book.language ? { language: book.language } : {}),
    fileName: book.fileName,
    mimeType: book.mimeType,
    size: book.size,
    sha256: book.sha256,
    importedAt: book.importedAt,
    updatedAt: book.updatedAt,
  };
}

function openPersonalBookDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new LibraryStorageError('unavailable', 'Personal book storage is unavailable in this browser session.', { retryable: false, sessionOnly: true }));
      return;
    }

    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(PERSONAL_DB_NAME, PERSONAL_DB_VERSION);
    } catch (error) {
      reject(normalizeLibraryStorageError(error, 'Personal book storage'));
      return;
    }

    open.addEventListener('upgradeneeded', (event) => {
      const db = open.result;
      if (!db.objectStoreNames.contains(PERSONAL_STORE)) db.createObjectStore(PERSONAL_STORE, { keyPath: 'id' });
      const transaction = open.transaction;
      if ((event as IDBVersionChangeEvent).oldVersion < 3 && transaction) {
        const cursorRequest = transaction.objectStore(PERSONAL_STORE).openCursor();
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (isRecord(cursor.value) && cursor.value.schemaVersion !== PERSONAL_BOOK_SCHEMA_VERSION) {
            cursor.update({ ...cursor.value, schemaVersion: PERSONAL_BOOK_SCHEMA_VERSION });
          }
          cursor.continue();
        });
      }
    });
    open.addEventListener('success', () => {
      const db = open.result;
      db.addEventListener('versionchange', () => db.close());
      resolve(db);
    });
    open.addEventListener('error', () => reject(normalizeLibraryStorageError(open.error ?? new Error('Unable to open personal book storage.'), 'Personal book storage')));
    open.addEventListener('blocked', () => reject(new LibraryStorageError(
      'blocked',
      'Personal book storage upgrade is blocked by another Library tab. Close the older tab and retry.',
    )));
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(normalizeLibraryStorageError(value.error ?? new Error('Personal book storage request failed.'), 'Personal book storage')));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(normalizeLibraryStorageError(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'), 'Personal book storage')), { once: true });
    transaction.addEventListener('error', () => reject(normalizeLibraryStorageError(transaction.error ?? new Error('Personal book storage transaction failed.'), 'Personal book storage')), { once: true });
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openPersonalBookDb();
  try {
    const transaction = db.transaction(PERSONAL_STORE, mode);
    const completion = transactionCompletion(transaction);
    try {
      const result = await operation(transaction.objectStore(PERSONAL_STORE));
      await completion;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch {}
      try { await completion; } catch {}
      throw normalizeLibraryStorageError(error, 'Personal book storage');
    }
  } catch (error) {
    throw normalizeLibraryStorageError(error, 'Personal book storage');
  } finally {
    db.close();
  }
}

function broadcast(kind: string, id?: string) {
  try {
    const channel = new BroadcastChannel(PERSONAL_CHANNEL);
    channel.postMessage({ kind, id, at: Date.now() });
    channel.close();
  } catch {
    // IndexedDB is authoritative. Cross-tab refresh is best-effort only.
  }
}

function cleanFileTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(epub|pdf)$/i, '');
  return withoutExtension.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled book';
}

function normalizeMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function detectFormat(file: File): PersonalBookFormat | undefined {
  const name = file.name.toLowerCase();
  if (file.type === 'application/epub+zip' || name.endsWith('.epub')) return 'epub';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return undefined;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot create the integrity hash required for personal books.');
  return hex(await crypto.subtle.digest('SHA-256', buffer));
}

async function extractEpubMetadata(buffer: ArrayBuffer): Promise<Pick<PersonalBookRecord, 'title' | 'creator' | 'language' | 'cover'>> {
  const book = ePub(buffer);
  try {
    await book.ready;
    const metadata = await book.loaded.metadata;
    const title = normalizeMetadata(metadata.title) ?? 'Untitled book';
    const creator = normalizeMetadata(metadata.creator);
    const language = normalizeMetadata(metadata.language);
    let cover: Blob | undefined;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl && (coverUrl.startsWith('blob:') || coverUrl.startsWith('data:'))) {
        const response = await fetch(coverUrl);
        if (response.ok) cover = await response.blob();
      }
    } catch {
      // Cover extraction is optional. Import succeeds without it.
    }
    return { title, ...(creator ? { creator } : {}), ...(language ? { language } : {}), ...(cover ? { cover } : {}) };
  } finally {
    book.destroy();
  }
}

function normalizeStoredRecord(record: StoredPersonalBookRecord | (Omit<StoredPersonalBookRecord, 'schemaVersion'> & { schemaVersion?: number })): PersonalBookRecord {
  const file = record.file instanceof Blob ? record.file : new Blob([record.file], { type: record.mimeType });
  return { ...record, schemaVersion: PERSONAL_BOOK_SCHEMA_VERSION, file } as PersonalBookRecord;
}

function storageError(error: unknown): Error {
  return normalizeLibraryStorageError(error, 'Personal book storage');
}

function readPendingMetadata(): PersonalBookPortableMetadataV1[] {
  try {
    const decoded = JSON.parse(localStorage.getItem(PENDING_METADATA_KEY) ?? '[]') as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded.filter(isPersonalBookPortableMetadataV1).sort((a, b) => a.sha256.localeCompare(b.sha256));
  } catch {
    return [];
  }
}

export function getPendingPersonalBookMetadata(): PersonalBookPortableMetadataV1[] {
  return readPendingMetadata();
}

export function replacePendingPersonalBookMetadata(records: PersonalBookPortableMetadataV1[]): void {
  if (!records.every(isPersonalBookPortableMetadataV1)) throw new Error('Invalid personal-book relink metadata.');
  const deduped = [...new Map(records.map((record) => [record.sha256, record])).values()]
    .sort((a, b) => a.sha256.localeCompare(b.sha256));
  localStorage.setItem(PENDING_METADATA_KEY, JSON.stringify(deduped));
}

function clearPendingMetadata(sha: string): void {
  const next = readPendingMetadata().filter((record) => record.sha256 !== sha);
  try { localStorage.setItem(PENDING_METADATA_KEY, JSON.stringify(next)); } catch {}
}

function pendingMetadataFor(sha: string, format: PersonalBookFormat): PersonalBookPortableMetadataV1 | undefined {
  return readPendingMetadata().find((record) => record.sha256 === sha && record.format === format);
}

export function personalReaderWorkId(book: Pick<PersonalBookRecord, 'id'>): string {
  return `personal:${book.id}`;
}

export function personalReaderReleaseVersion(book: Pick<PersonalBookRecord, 'sha256'>): string {
  return `local-${book.sha256}`;
}

export async function getPersonalBookPortableMetadata(): Promise<PersonalBookPortableMetadataV1[]> {
  const books = await getPersonalBooks();
  const merged = new Map<string, PersonalBookPortableMetadataV1>();
  for (const record of readPendingMetadata()) merged.set(record.sha256, record);
  for (const book of books) merged.set(book.sha256, portableMetadata(book));
  return [...merged.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
}

export async function importPersonalBook(file: File): Promise<{ record: PersonalBookRecord; duplicate: boolean }> {
  const format = detectFormat(file);
  if (!format) throw new Error('Choose an EPUB or PDF file.');
  if (file.size <= 0) throw new Error('This file is empty.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('This book is larger than the 250 MB personal-import limit.');

  const buffer = await file.arrayBuffer();
  const compatibility = await inspectPublication(buffer, format);
  const digest = await sha256(buffer);
  const id = `${format}-${digest.slice(0, 32)}`;
  const restored = pendingMetadataFor(digest, format);
  const existing = await getPersonalBook(id);
  if (existing?.sha256 === digest) {
    clearPendingMetadata(digest);
    return { record: existing, duplicate: true };
  }

  const now = new Date().toISOString();
  const metadata = format === 'epub' ? await extractEpubMetadata(buffer) : { title: cleanFileTitle(file.name) };
  const extractedTitle = metadata.title === 'Untitled book' ? cleanFileTitle(file.name) : metadata.title;
  const mimeType = format === 'epub' ? 'application/epub+zip' : 'application/pdf';
  const record: PersonalBookRecord = {
    schemaVersion: PERSONAL_BOOK_SCHEMA_VERSION,
    id,
    format,
    title: restored?.title ?? extractedTitle,
    ...(restored?.creator ? { creator: restored.creator } : ('creator' in metadata && metadata.creator ? { creator: metadata.creator } : {})),
    ...(restored?.language ? { language: restored.language } : ('language' in metadata && metadata.language ? { language: metadata.language } : {})),
    fileName: restored?.fileName ?? file.name,
    mimeType,
    size: file.size,
    sha256: digest,
    importedAt: restored?.importedAt ?? now,
    updatedAt: restored?.updatedAt ?? now,
    file: new Blob([buffer], { type: mimeType }),
    ...('cover' in metadata && metadata.cover ? { cover: metadata.cover } : {}),
    compatibility,
  };
  const storedRecord: StoredPersonalBookRecord = { ...record, file: buffer.slice(0) };

  try {
    await withStore('readwrite', async (store) => { await request(store.put(storedRecord)); });
  } catch (error) {
    throw storageError(error);
  }
  clearPendingMetadata(digest);
  broadcast('imported', id);
  return { record, duplicate: false };
}

export async function getPersonalBook(id: string): Promise<PersonalBookRecord | undefined> {
  if (!id) return undefined;
  const record = await withStore('readonly', (store) => request<StoredPersonalBookRecord | undefined>(store.get(id)));
  return record ? normalizeStoredRecord(record) : undefined;
}

export async function getPersonalBooks(): Promise<PersonalBookSummary[]> {
  return withStore('readonly', async (store) => {
    const records = await request<StoredPersonalBookRecord[]>(store.getAll());
    return records
      .map(normalizeStoredRecord)
      .map(({ file: _file, ...summary }) => summary)
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  });
}

export async function deletePersonalBook(id: string): Promise<void> {
  await withStore('readwrite', async (store) => { await request(store.delete(id)); });
  broadcast('deleted', id);
}

export async function requestPersonalLibraryPersistence(): Promise<boolean | undefined> {
  try {
    if (!navigator.storage?.persist) return undefined;
    return await navigator.storage.persist();
  } catch {
    return undefined;
  }
}

export function subscribePersonalBooks(listener: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(PERSONAL_CHANNEL);
    channel.addEventListener('message', listener);
  } catch {}
  return () => channel?.close();
}
