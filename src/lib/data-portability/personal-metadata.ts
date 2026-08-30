import { openLibraryDb } from '../client/library-db';

export const PORTABLE_PERSONAL_METADATA_STORE = 'portablePersonalMetadata' as const;
export const PORTABLE_PERSONAL_METADATA_SCHEMA_VERSION = 1 as const;

export type PortablePersonalBookFormat = 'epub' | 'pdf';

export interface PortablePersonalBookMetadataV1 {
  schemaVersion: typeof PORTABLE_PERSONAL_METADATA_SCHEMA_VERSION;
  id: string;
  format: PortablePersonalBookFormat;
  title: string;
  creator?: string;
  language?: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  importedAt: string;
  updatedAt: string;
  compatibility?: unknown;
}

export interface PortablePersonalBookSource {
  id: string;
  format: PortablePersonalBookFormat;
  title: string;
  creator?: string;
  language?: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  importedAt: string;
  updatedAt: string;
  compatibility?: unknown;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('Portable personal-book metadata request failed.')));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Portable metadata transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Portable metadata transaction failed.')), { once: true });
  });
}

export function isPortablePersonalBookMetadataV1(value: unknown): value is PortablePersonalBookMetadataV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<PortablePersonalBookMetadataV1>;
  return record.schemaVersion === PORTABLE_PERSONAL_METADATA_SCHEMA_VERSION
    && typeof record.id === 'string' && record.id.length > 0
    && (record.format === 'epub' || record.format === 'pdf')
    && typeof record.title === 'string' && record.title.length > 0
    && (record.creator === undefined || typeof record.creator === 'string')
    && (record.language === undefined || typeof record.language === 'string')
    && typeof record.fileName === 'string'
    && typeof record.mimeType === 'string'
    && typeof record.size === 'number' && Number.isFinite(record.size) && record.size >= 0
    && typeof record.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(record.sha256)
    && typeof record.importedAt === 'string'
    && typeof record.updatedAt === 'string';
}

export function portablePersonalBookMetadata(source: PortablePersonalBookSource): PortablePersonalBookMetadataV1 {
  return {
    schemaVersion: PORTABLE_PERSONAL_METADATA_SCHEMA_VERSION,
    id: source.id,
    format: source.format,
    title: source.title,
    ...(source.creator ? { creator: source.creator } : {}),
    ...(source.language ? { language: source.language } : {}),
    fileName: source.fileName,
    mimeType: source.mimeType,
    size: source.size,
    sha256: source.sha256,
    importedAt: source.importedAt,
    updatedAt: source.updatedAt,
    ...(source.compatibility === undefined ? {} : { compatibility: source.compatibility }),
  };
}

export async function getPortablePersonalBookMetadata(id: string): Promise<PortablePersonalBookMetadataV1 | undefined> {
  const db = await openLibraryDb();
  try {
    if (!db.objectStoreNames.contains(PORTABLE_PERSONAL_METADATA_STORE)) return undefined;
    const transaction = db.transaction(PORTABLE_PERSONAL_METADATA_STORE, 'readonly');
    const completion = transactionCompletion(transaction);
    const value = await request<unknown>(transaction.objectStore(PORTABLE_PERSONAL_METADATA_STORE).get(id));
    await completion;
    return isPortablePersonalBookMetadataV1(value) ? value : undefined;
  } finally {
    db.close();
  }
}

export async function getPortablePersonalBookMetadataRecords(): Promise<PortablePersonalBookMetadataV1[]> {
  const db = await openLibraryDb();
  try {
    if (!db.objectStoreNames.contains(PORTABLE_PERSONAL_METADATA_STORE)) return [];
    const transaction = db.transaction(PORTABLE_PERSONAL_METADATA_STORE, 'readonly');
    const completion = transactionCompletion(transaction);
    const values = await request<unknown[]>(transaction.objectStore(PORTABLE_PERSONAL_METADATA_STORE).getAll());
    await completion;
    return values.filter(isPortablePersonalBookMetadataV1).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}
