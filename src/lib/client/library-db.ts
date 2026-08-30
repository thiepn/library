const DB_NAME = 'thiepn-library';
const DB_VERSION = 9;
const CHANNEL = 'thiepn-library';

export const LIBRARY_DB_VERSION = DB_VERSION;
export const LIBRARY_CHANNEL = CHANNEL;

// P12 compatibility history: before P29 the legacy/native bridge used `DB_VERSION = 6`.
// Its Legacy progress writer protected native records with
// `if (isReaderProgressRecordV2(existing)) return`. P29 keeps the same safety invariant
// by moving legacy writes into a separate store, while preserving the old API aliases.
// RR8 keeps those historical stores intact while adding portable PDF state and
// metadata-only personal-book recovery to the same transactional state database.

export type StoreName =
  | 'recent'
  | 'progress'
  | 'legacyProgress'
  | 'bookmarks'
  | 'favorites'
  | 'history'
  | 'annotations'
  | 'annotationStats'
  | 'readingSessions'
  | 'readingActivity'
  | 'pdfProgress'
  | 'pdfBookmarks'
  | 'portablePersonalMetadata';

export const FAVORITE_SCHEMA_VERSION = 1 as const;
export const LEGACY_PROGRESS_SCHEMA_VERSION = 1 as const;
export const LEGACY_ANNOTATION_SCHEMA_VERSION = 1 as const;

export interface FavoriteRecordV1 {
  schemaVersion: typeof FAVORITE_SCHEMA_VERSION;
  workId: string;
  savedAt: string;
}

type LegacyFavoriteRecord = Omit<FavoriteRecordV1, 'schemaVersion'>;

/** Legacy chapter/scroll progress retained while the old Markdown reader remains available. */
export interface ProgressRecord {
  workId: string;
  chapterId: string;
  percent: number;
  updatedAt: string;
}

export interface StoredLegacyProgressRecordV1 extends ProgressRecord {
  schemaVersion: typeof LEGACY_PROGRESS_SCHEMA_VERSION;
}

/** Native EPUB reader progress. Percentages are normalized to the 0..1 range. */
export interface ReaderProgressRecordV2 {
  schemaVersion: 2;
  workId: string;
  edition: number;
  releaseVersion: string;
  cfi: string;
  percentage: number;
  furthestPercentage: number;
  chapterHref?: string;
  chapterLabel?: string;
  updatedAt: string;
}

export type ReadingActivityFormat = 'epub' | 'pdf' | 'web';
export type ReadingActivitySource = 'hosted' | 'personal';

export interface ReadingActivityRecordV1 {
  schemaVersion: 1;
  workId: string;
  edition: number;
  releaseVersion: string;
  format: ReadingActivityFormat;
  source: ReadingActivitySource;
  openedAt: string;
}

export type StoredProgressRecord = ProgressRecord | StoredLegacyProgressRecordV1 | ReaderProgressRecordV2;

export interface AnnotationRecord {
  schemaVersion?: typeof LEGACY_ANNOTATION_SCHEMA_VERSION;
  id: string;
  workId: string;
  chapterId?: string;
  quote?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyAnnotationRecordV1 extends AnnotationRecord {
  schemaVersion: typeof LEGACY_ANNOTATION_SCHEMA_VERSION;
}

const storeDefinitions: Array<[StoreName, string]> = [
  ['recent', 'workId'],
  ['progress', 'workId'],
  ['legacyProgress', 'workId'],
  ['bookmarks', 'id'],
  ['favorites', 'workId'],
  ['history', 'workId'],
  ['annotations', 'id'],
  ['annotationStats', 'workId'],
  ['readingSessions', 'id'],
  ['readingActivity', 'workId'],
  ['pdfProgress', 'id'],
  ['pdfBookmarks', 'id'],
  ['portablePersonalMetadata', 'id'],
];

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('IndexedDB request failed')));
  });
}

function isLegacyFavoriteRecord(value: unknown): value is LegacyFavoriteRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<LegacyFavoriteRecord> & { schemaVersion?: unknown };
  return record.schemaVersion === undefined
    && typeof record.workId === 'string'
    && record.workId.length > 0
    && typeof record.savedAt === 'string';
}

export function isFavoriteRecordV1(value: unknown): value is FavoriteRecordV1 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<FavoriteRecordV1>;
  return record.schemaVersion === FAVORITE_SCHEMA_VERSION
    && typeof record.workId === 'string'
    && record.workId.length > 0
    && typeof record.savedAt === 'string';
}

function isLegacyProgressRecord(value: unknown): value is ProgressRecord | StoredLegacyProgressRecordV1 {
  if (typeof value !== 'object' || value === null || isReaderProgressRecordV2(value)) return false;
  const record = value as Partial<ProgressRecord> & { schemaVersion?: unknown };
  return (record.schemaVersion === undefined || record.schemaVersion === LEGACY_PROGRESS_SCHEMA_VERSION)
    && typeof record.workId === 'string'
    && typeof record.chapterId === 'string'
    && typeof record.percent === 'number'
    && Number.isFinite(record.percent)
    && typeof record.updatedAt === 'string';
}

export function isStoredLegacyProgressRecordV1(value: unknown): value is StoredLegacyProgressRecordV1 {
  return isLegacyProgressRecord(value)
    && (value as { schemaVersion?: unknown }).schemaVersion === LEGACY_PROGRESS_SCHEMA_VERSION;
}

function toStoredLegacyProgress(record: ProgressRecord | StoredLegacyProgressRecordV1): StoredLegacyProgressRecordV1 {
  return {
    schemaVersion: LEGACY_PROGRESS_SCHEMA_VERSION,
    workId: record.workId,
    chapterId: record.chapterId,
    percent: Math.min(100, Math.max(0, Number.isFinite(record.percent) ? record.percent : 0)),
    updatedAt: record.updatedAt,
  };
}

function toPublicLegacyProgress(record: ProgressRecord | StoredLegacyProgressRecordV1): ProgressRecord {
  return {
    workId: record.workId,
    chapterId: record.chapterId,
    percent: record.percent,
    updatedAt: record.updatedAt,
  };
}

function isLegacyAnnotationCandidate(value: unknown): value is AnnotationRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<AnnotationRecord> & { cfiRange?: unknown; schemaVersion?: unknown };
  return record.cfiRange === undefined
    && (record.schemaVersion === undefined || record.schemaVersion === LEGACY_ANNOTATION_SCHEMA_VERSION)
    && typeof record.id === 'string' && record.id.length > 0
    && typeof record.workId === 'string' && record.workId.length > 0
    && typeof record.note === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

export function isLegacyAnnotationRecordV1(value: unknown): value is LegacyAnnotationRecordV1 {
  return isLegacyAnnotationCandidate(value)
    && (value as { schemaVersion?: unknown }).schemaVersion === LEGACY_ANNOTATION_SCHEMA_VERSION;
}

function migrateCursor(
  store: IDBObjectStore,
  transform: (value: unknown) => unknown | undefined,
): void {
  const cursorRequest = store.openCursor();
  cursorRequest.addEventListener('success', () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const next = transform(cursor.value);
    if (next !== undefined) cursor.update(next);
    cursor.continue();
  });
}

export function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.addEventListener('upgradeneeded', (event) => {
      const db = open.result;
      const transaction = open.transaction;
      for (const [name, keyPath] of storeDefinitions) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }

      if (transaction) {
        const pdfBookmarks = transaction.objectStore('pdfBookmarks');
        if (!pdfBookmarks.indexNames.contains('publicationKey')) {
          pdfBookmarks.createIndex('publicationKey', 'publicationKey', { unique: false });
        }
      }

      // P29: preserve any pre-bridge Markdown position before native progress can
      // replace the old shared `progress` value for the same workId.
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (oldVersion < 7 && transaction) {
        const shared = transaction.objectStore('progress');
        const legacy = transaction.objectStore('legacyProgress');
        const cursorRequest = shared.openCursor();
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (isLegacyProgressRecord(cursor.value)) legacy.put(toStoredLegacyProgress(cursor.value));
          cursor.continue();
        });
      }

      // RR8 v9 makes actively portable historical records explicitly versioned.
      // This is additive and never deletes an old store or changes native position identity.
      if (oldVersion < 9 && transaction) {
        migrateCursor(transaction.objectStore('favorites'), (value) => {
          if (!isLegacyFavoriteRecord(value)) return undefined;
          return { schemaVersion: FAVORITE_SCHEMA_VERSION, ...value } satisfies FavoriteRecordV1;
        });
        migrateCursor(transaction.objectStore('legacyProgress'), (value) => {
          if (!isLegacyProgressRecord(value) || isStoredLegacyProgressRecordV1(value)) return undefined;
          return toStoredLegacyProgress(value);
        });
        migrateCursor(transaction.objectStore('progress'), (value) => {
          if (!isLegacyProgressRecord(value) || isStoredLegacyProgressRecordV1(value)) return undefined;
          return toStoredLegacyProgress(value);
        });
        migrateCursor(transaction.objectStore('annotations'), (value) => {
          if (!isLegacyAnnotationCandidate(value) || isLegacyAnnotationRecordV1(value)) return undefined;
          return { ...value, schemaVersion: LEGACY_ANNOTATION_SCHEMA_VERSION } satisfies LegacyAnnotationRecordV1;
        });
      }
    });
    open.addEventListener('success', () => {
      const db = open.result;
      db.addEventListener('versionchange', () => db.close());
      resolve(db);
    });
    open.addEventListener('error', () => reject(open.error ?? new Error('Unable to open Library state')));
    open.addEventListener('blocked', () => reject(new Error('Library state upgrade is blocked by another tab')));
  });
}

async function withStore<T>(name: StoreName, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openLibraryDb();
  try {
    const transaction = db.transaction(name, mode);
    const value = await operation(transaction.objectStore(name));
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')));
      transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')));
    });
    return value;
  } finally {
    db.close();
  }
}

function broadcast(kind: string, workId?: string) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ kind, workId, at: Date.now() });
    channel.close();
  } catch {
    // Cross-tab invalidation is best-effort; IndexedDB remains authoritative.
  }
}

function clampPercent01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function isReaderProgressRecordV2(value: unknown): value is ReaderProgressRecordV2 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ReaderProgressRecordV2>;
  return record.schemaVersion === 2
    && typeof record.workId === 'string'
    && typeof record.edition === 'number'
    && Number.isFinite(record.edition)
    && typeof record.releaseVersion === 'string'
    && typeof record.cfi === 'string'
    && record.cfi.startsWith('epubcfi(')
    && typeof record.percentage === 'number'
    && Number.isFinite(record.percentage)
    && typeof record.furthestPercentage === 'number'
    && Number.isFinite(record.furthestPercentage)
    && typeof record.updatedAt === 'string';
}

export async function getFavoriteWorkIds(): Promise<string[]> {
  return withStore('favorites', 'readonly', async (store) => {
    const values = await request<unknown[]>(store.getAll());
    return values
      .filter((record): record is FavoriteRecordV1 | LegacyFavoriteRecord => isFavoriteRecordV1(record) || isLegacyFavoriteRecord(record))
      .map((record) => record.workId);
  });
}

export async function isFavorite(workId: string): Promise<boolean> {
  return withStore('favorites', 'readonly', async (store) => {
    const value = await request<unknown>(store.get(workId));
    return isFavoriteRecordV1(value) || isLegacyFavoriteRecord(value);
  });
}

export async function setFavorite(workId: string, saved: boolean): Promise<void> {
  await withStore('favorites', 'readwrite', async (store) => {
    if (saved) {
      await request(store.put({
        schemaVersion: FAVORITE_SCHEMA_VERSION,
        workId,
        savedAt: new Date().toISOString(),
      } satisfies FavoriteRecordV1));
    } else await request(store.delete(workId));
  });
  broadcast('favorites', workId);
}

export async function toggleFavorite(workId: string): Promise<boolean> {
  const next = !(await isFavorite(workId));
  await setFavorite(workId, next);
  return next;
}

/**
 * P29 legacy progress reader. The dedicated sidecar is authoritative after DB v7.
 * A pre-P29 legacy record still in the shared progress store is imported lazily as
 * an additional recovery path for browsers upgrading from an older cached build.
 */
export async function getLegacyProgress(workId: string): Promise<ProgressRecord | undefined> {
  const sidecar = await withStore('legacyProgress', 'readonly', async (store) => {
    const stored = await request<unknown>(store.get(workId));
    return isLegacyProgressRecord(stored) ? toPublicLegacyProgress(stored) : undefined;
  });
  if (sidecar) return sidecar;

  const shared = await withStore('progress', 'readonly', async (store) => {
    const stored = await request<StoredProgressRecord | undefined>(store.get(workId));
    return isLegacyProgressRecord(stored) ? toPublicLegacyProgress(stored) : undefined;
  });
  if (!shared) return undefined;

  try {
    await withStore('legacyProgress', 'readwrite', async (store) => {
      await request(store.put(toStoredLegacyProgress(shared)));
    });
  } catch {
    // The recovered value is still usable for this launch even if sidecar repair fails.
  }
  return shared;
}

/** Legacy writer isolated from native EPUB progress. */
export async function setLegacyProgress(workId: string, progress: ProgressRecord): Promise<void> {
  if (progress.workId !== workId) throw new Error('Progress work identity mismatch');
  const next = toStoredLegacyProgress(progress);
  let changed = false;
  await withStore('legacyProgress', 'readwrite', async (store) => {
    const existing = await request<unknown>(store.get(workId));
    if (isLegacyProgressRecord(existing) && existing.percent > next.percent) return;
    await request(store.put(next));
    changed = true;
  });
  if (changed) broadcast('legacyProgress', workId);
}

/** Compatibility aliases retained for old ReaderLayout bundles and call sites. */
export async function getProgress(workId: string): Promise<ProgressRecord | undefined> {
  return getLegacyProgress(workId);
}

export async function setProgress(workId: string, progress: ProgressRecord): Promise<void> {
  return setLegacyProgress(workId, progress);
}

export async function getReaderProgress(workId: string): Promise<ReaderProgressRecordV2 | undefined> {
  return withStore('progress', 'readonly', async (store) => {
    const stored = await request<StoredProgressRecord | undefined>(store.get(workId));
    if (!isReaderProgressRecordV2(stored)) return undefined;
    const percentage = clampPercent01(stored.percentage);
    return {
      ...stored,
      percentage,
      furthestPercentage: Math.max(percentage, clampPercent01(stored.furthestPercentage)),
    };
  });
}

/**
 * Saves exact current EPUB location while keeping furthest progress monotonic only within
 * the same work edition/release. A new release starts a new progress lineage.
 */
export async function setReaderProgress(workId: string, progress: ReaderProgressRecordV2): Promise<void> {
  if (progress.workId !== workId) throw new Error('Progress work identity mismatch');
  if (!progress.cfi.startsWith('epubcfi(')) throw new Error('Native reader progress requires an EPUB CFI');

  const percentage = clampPercent01(progress.percentage);
  const next: ReaderProgressRecordV2 = {
    ...progress,
    schemaVersion: 2,
    percentage,
    furthestPercentage: Math.max(percentage, clampPercent01(progress.furthestPercentage)),
  };

  await withStore('progress', 'readwrite', async (store) => {
    const existing = await request<StoredProgressRecord | undefined>(store.get(workId));
    if (
      isReaderProgressRecordV2(existing)
      && existing.edition === next.edition
      && existing.releaseVersion === next.releaseVersion
    ) {
      next.furthestPercentage = Math.max(next.furthestPercentage, clampPercent01(existing.furthestPercentage));
    }
    await request(store.put(next));
  });
  broadcast('progress', workId);
}

export function isReadingActivityRecordV1(value: unknown): value is ReadingActivityRecordV1 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ReadingActivityRecordV1>;
  return record.schemaVersion === 1
    && typeof record.workId === 'string'
    && typeof record.edition === 'number'
    && Number.isFinite(record.edition)
    && typeof record.releaseVersion === 'string'
    && (record.format === 'epub' || record.format === 'pdf' || record.format === 'web')
    && (record.source === 'hosted' || record.source === 'personal')
    && typeof record.openedAt === 'string';
}

export async function getReadingActivity(workId: string): Promise<ReadingActivityRecordV1 | undefined> {
  return withStore('readingActivity', 'readonly', async (store) => {
    const stored = await request<ReadingActivityRecordV1 | undefined>(store.get(workId));
    return isReadingActivityRecordV1(stored) ? stored : undefined;
  });
}

export async function getReadingActivities(): Promise<ReadingActivityRecordV1[]> {
  return withStore('readingActivity', 'readonly', async (store) => {
    const values = await request<ReadingActivityRecordV1[]>(store.getAll());
    return values
      .filter(isReadingActivityRecordV1)
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  });
}

export async function recordReadingActivity(
  input: Omit<ReadingActivityRecordV1, 'schemaVersion' | 'openedAt'> & { openedAt?: string },
): Promise<ReadingActivityRecordV1> {
  if (!input.workId.trim()) throw new Error('Reading activity requires a work identity');
  if (!Number.isFinite(input.edition)) throw new Error('Reading activity requires a valid edition');
  const record: ReadingActivityRecordV1 = {
    schemaVersion: 1,
    workId: input.workId,
    edition: input.edition,
    releaseVersion: input.releaseVersion,
    format: input.format,
    source: input.source,
    openedAt: input.openedAt ?? new Date().toISOString(),
  };
  let committed = record;
  await withStore('readingActivity', 'readwrite', async (store) => {
    const existing = await request<ReadingActivityRecordV1 | undefined>(store.get(input.workId));
    if (isReadingActivityRecordV1(existing) && existing.openedAt > record.openedAt) {
      committed = existing;
      return;
    }
    await request(store.put(record));
  });
  if (committed === record) broadcast('readingActivity', input.workId);
  return committed;
}

export async function deleteReadingActivity(workId: string): Promise<void> {
  await withStore('readingActivity', 'readwrite', async (store) => {
    await request(store.delete(workId));
  });
  broadcast('readingActivity', workId);
}

export async function getAnnotations(): Promise<AnnotationRecord[]> {
  return withStore('annotations', 'readonly', async (store) => {
    const values = await request<AnnotationRecord[]>(store.getAll());
    return values
      .filter((record) => typeof record?.updatedAt === 'string')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export async function deleteAnnotation(id: string): Promise<void> {
  await withStore('annotations', 'readwrite', async (store) => { await request(store.delete(id)); });
  broadcast('annotations');
}

export function subscribeLibraryState(listener: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', listener);
  } catch {}
  const storageListener = () => listener();
  window.addEventListener('storage', storageListener);
  return () => {
    channel?.close();
    window.removeEventListener('storage', storageListener);
  };
}
