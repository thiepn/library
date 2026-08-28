import ePub from 'epubjs';

const PERSONAL_DB_NAME = 'thiepn-library-personal-books';
const PERSONAL_DB_VERSION = 1;
const PERSONAL_STORE = 'books';
const PERSONAL_CHANNEL = 'thiepn-library-personal-books';
const MAX_IMPORT_BYTES = 250 * 1024 * 1024;

export type PersonalBookFormat = 'epub' | 'pdf';

export interface PersonalBookRecord {
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
}

export interface PersonalBookSummary extends Omit<PersonalBookRecord, 'file' | 'cover'> {
  cover?: Blob;
}

function openPersonalBookDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PERSONAL_DB_NAME, PERSONAL_DB_VERSION);
    open.addEventListener('upgradeneeded', () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(PERSONAL_STORE)) db.createObjectStore(PERSONAL_STORE, { keyPath: 'id' });
    });
    open.addEventListener('success', () => resolve(open.result));
    open.addEventListener('error', () => reject(open.error ?? new Error('Unable to open personal book storage.')));
    open.addEventListener('blocked', () => reject(new Error('Personal book storage is blocked by another tab.')));
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('Personal book storage request failed.')));
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openPersonalBookDb();
  try {
    const transaction = db.transaction(PERSONAL_STORE, mode);
    const result = await operation(transaction.objectStore(PERSONAL_STORE));
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Personal book storage transaction aborted.')));
      transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Personal book storage transaction failed.')));
    });
    return result;
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

function storageError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'UnknownError')) {
    return new Error('Not enough browser storage is available to keep this book locally.');
  }
  return error instanceof Error ? error : new Error('Unable to import this book.');
}

export function personalReaderWorkId(book: Pick<PersonalBookRecord, 'id'>): string {
  return `personal:${book.id}`;
}

export function personalReaderReleaseVersion(book: Pick<PersonalBookRecord, 'sha256'>): string {
  return `local-${book.sha256}`;
}

export async function importPersonalBook(file: File): Promise<{ record: PersonalBookRecord; duplicate: boolean }> {
  const format = detectFormat(file);
  if (!format) throw new Error('Choose an EPUB or PDF file.');
  if (file.size <= 0) throw new Error('This file is empty.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('This book is larger than the 250 MB personal-import limit.');

  const buffer = await file.arrayBuffer();
  const digest = await sha256(buffer);
  const id = `${format}-${digest.slice(0, 32)}`;
  const existing = await getPersonalBook(id);
  if (existing?.sha256 === digest) return { record: existing, duplicate: true };

  const now = new Date().toISOString();
  const metadata = format === 'epub'
    ? await extractEpubMetadata(buffer)
    : { title: cleanFileTitle(file.name) };
  const title = metadata.title === 'Untitled book' ? cleanFileTitle(file.name) : metadata.title;
  const record: PersonalBookRecord = {
    id,
    format,
    title,
    ...('creator' in metadata && metadata.creator ? { creator: metadata.creator } : {}),
    ...('language' in metadata && metadata.language ? { language: metadata.language } : {}),
    fileName: file.name,
    mimeType: format === 'epub' ? 'application/epub+zip' : 'application/pdf',
    size: file.size,
    sha256: digest,
    importedAt: now,
    updatedAt: now,
    file: new Blob([buffer], { type: format === 'epub' ? 'application/epub+zip' : 'application/pdf' }),
    ...('cover' in metadata && metadata.cover ? { cover: metadata.cover } : {}),
  };

  try {
    await withStore('readwrite', async (store) => { await request(store.put(record)); });
  } catch (error) {
    throw storageError(error);
  }
  broadcast('imported', id);
  return { record, duplicate: false };
}

export async function getPersonalBook(id: string): Promise<PersonalBookRecord | undefined> {
  if (!id) return undefined;
  return withStore('readonly', (store) => request<PersonalBookRecord | undefined>(store.get(id)));
}

export async function getPersonalBooks(): Promise<PersonalBookSummary[]> {
  return withStore('readonly', async (store) => {
    const records = await request<PersonalBookRecord[]>(store.getAll());
    return records
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
