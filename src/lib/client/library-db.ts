const DB_NAME = 'thiepn-library';
const DB_VERSION = 9;
const CHANNEL = 'thiepn-library';

// P12 compatibility history: before P29 the legacy/native bridge used `DB_VERSION = 6`.
// Its Legacy progress writer protected native records with
// `if (isReaderProgressRecordV2(existing)) return`. P29 keeps the same safety invariant
// by moving legacy writes into a separate store, while preserving the old API aliases.

export const FAVORITE_SCHEMA_VERSION = 1 as const;
export const LEGACY_PROGRESS_SCHEMA_VERSION = 1 as const;

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
  | 'readingActivity';

export interface FavoriteRecord {
  schemaVersion: typeof FAVORITE_SCHEMA_VERSION;
  workId: string;
  savedAt: string;
}

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

export type StoredProgressRecord = StoredLegacyProgressRecordV1 | ReaderProgressRecordV2 | ProgressRecord;

export interface AnnotationRecord {
  id: string;
  workId: string;
  chapterId?: string;
  quote?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryDbPortabilitySnapshot {
  favorites: FavoriteRecord[];
  epubProgress: ReaderProgressRecordV2[];
  legacyProgress: StoredLegacyProgressRecordV1[];
  bookmarks: unknown[];
  annotations: unknown[];
  readingActivity: ReadingActivityRecordV1[];
}

export type LibraryDbPortabilityPatch = Partial<LibraryDbPortabilitySnapshot>;

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
];

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('IndexedDB request failed')));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')), { once: true });
  });
}

function isLegacyProgressShape(value: unknown): value is ProgressRecord {
  if (typeof value !== 'object' || value === null || isReaderProgressRecordV2(value)) return false;
  const record = value as Partial<ProgressRecord>;
  return typeof record.workId === 'string'
    && typeof record.chapterId === 'string'
    && typeof record.percent === 'number'
    && Number.isFinite(record.percent)
    && typeof record.updatedAt === 'string';
}

function normalizeLegacyProgressRecord(value: unknown): StoredLegacyProgressRecordV1 | undefined {
  if (!isLegacyProgressShape(value)) return undefined;
  return {
    schemaVersion: LEGACY_PROGRESS_SCHEMA_VERSION,
    workId: value.workId,
    chapterId: value.chapterId,
    percent: Math.min(100, Math.max(0, value.percent)),
    updatedAt: value.updatedAt,
  };
}

function normalizeFavoriteRecord(value: unknown): FavoriteRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Partial<FavoriteRecord>;
  if (typeof record.workId !== 'string' || !record.workId || typeof record.savedAt !== 'string') return undefined;
  return { schemaVersion: FAVORITE_SCHEMA_VERSION, workId: record.workId, savedAt: record.savedAt };
}

function isLegacyProgressRecord(value: unknown): value is ProgressRecord {
  return normalizeLegacyProgressRecord(value) !== undefined;
}

export function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.addEventListener('upgradeneeded', (event) => {
      const db = open.result;
      for (const [name, keyPath] of storeDefinitions) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }

      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      const transaction = open.transaction;
      if (oldVersion < 7 && transaction) {
        const shared = transaction.objectStore('progress');
        const legacy = transaction.objectStore('legacyProgress');
        const cursorRequest = shared.openCursor();
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const normalized = normalizeLegacyProgressRecord(cursor.value);
          if (normalized) legacy.put(normalized);
          cursor.continue();
        });
      }

      // RR8: active records that predated explicit schema tags are normalized in place.
      if (oldVersion < 9 && transaction) {
        const favoriteCursor = transaction.objectStore('favorites').openCursor();
        favoriteCursor.addEventListener('success', () => {
          const cursor = favoriteCursor.result;
          if (!cursor) return;
          const normalized = normalizeFavoriteRecord(cursor.value);
          if (normalized) cursor.update(normalized);
          cursor.continue();
        });

        const legacyCursor = transaction.objectStore('legacyProgress').openCursor();
        legacyCursor.addEventListener('success', () => {
          const cursor = legacyCursor.result;
          if (!cursor) return;
          const normalized = normalizeLegacyProgressRecord(cursor.value);
          if (normalized) cursor.update(normalized);
          cursor.continue();
        });

        const sharedCursor = transaction.objectStore('progress').openCursor();
        sharedCursor.addEventListener('success', () => {
          const cursor = sharedCursor.result;
          if (!cursor) return;
          const normalized = normalizeLegacyProgressRecord(cursor.value);
          if (normalized) cursor.update(normalized);
          cursor.continue();
        });
      }
    });
    open.addEventListener('success', () => resolve(open.result));
    open.addEventListener('error', () => reject(open.error ?? new Error('Unable to open Library state')));
    open.addEventListener('blocked', () => reject(new Error('Library state upgrade is blocked by another tab')));
  });
}

async function withStore<T>(name: StoreName, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openLibraryDb();
  try {
    const transaction = db.transaction(name, mode);
    const value = await operation(transaction.objectStore(name));
    await transactionCompletion(transaction);
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

export async function getFavoriteWorkIds(): Promise<string[]> {
  return withStore('favorites', 'readonly', async (store) => {
    const values = await request<unknown[]>(store.getAll());
    return values.map(normalizeFavoriteRecord).filter((record): record is FavoriteRecord => Boolean(record)).map((record) => record.workId);
  });
}

export async function isFavorite(workId: string): Promise<boolean> {
  return withStore('favorites', 'readonly', async (store) => Boolean(await request(store.get(workId))));
}

export async function setFavorite(workId: string, saved: boolean): Promise<void> {
  await withStore('favorites', 'readwrite', async (store) => {
    if (saved) await request(store.put({ schemaVersion: FAVORITE_SCHEMA_VERSION, workId, savedAt: new Date().toISOString() } satisfies FavoriteRecord));
    else await request(store.delete(workId));
  });
  broadcast('favorites', workId);
}

export async function toggleFavorite(workId: string): Promise<boolean> {
  const next = !(await isFavorite(workId));
  await setFavorite(workId, next);
  return next;
}

export async function getLegacyProgress(workId: string): Promise<ProgressRecord | undefined> {
  const sidecar = await withStore('legacyProgress', 'readonly', async (store) => normalizeLegacyProgressRecord(await request<unknown>(store.get(workId))));
  if (sidecar) {
    const { schemaVersion: _schemaVersion, ...progress } = sidecar;
    return progress;
  }

  const shared = await withStore('progress', 'readonly', async (store) => normalizeLegacyProgressRecord(await request<unknown>(store.get(workId))));
  if (!shared) return undefined;
  try {
    await withStore('legacyProgress', 'readwrite', async (store) => { await request(store.put(shared)); });
  } catch {
    // The recovered value is still usable for this launch even if sidecar repair fails.
  }
  const { schemaVersion: _schemaVersion, ...progress } = shared;
  return progress;
}

export async function setLegacyProgress(workId: string, progress: ProgressRecord): Promise<void> {
  if (progress.workId !== workId) throw new Error('Progress work identity mismatch');
  const next: StoredLegacyProgressRecordV1 = {
    schemaVersion: LEGACY_PROGRESS_SCHEMA_VERSION,
    ...progress,
    percent: Math.min(100, Math.max(0, Number.isFinite(progress.percent) ? progress.percent : 0)),
  };
  let changed = false;
  await withStore('legacyProgress', 'readwrite', async (store) => {
    const existing = normalizeLegacyProgressRecord(await request<unknown>(store.get(workId)));
    if (existing && existing.percent > next.percent) return;
    await request(store.put(next));
    changed = true;
  });
  if (changed) broadcast('legacyProgress', workId);
}

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
    return { ...stored, percentage, furthestPercentage: Math.max(percentage, clampPercent01(stored.furthestPercentage)) };
  });
}

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
    if (isReaderProgressRecordV2(existing) && existing.edition === next.edition && existing.releaseVersion === next.releaseVersion) {
      next.furthestPercentage = Math.max(next.furthestPercentage, clampPercent01(existing.furthestPercentage));
    }
    await request(store.put(next));
  });
  broadcast('progress', workId);
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
    return values.filter(isReadingActivityRecordV1).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
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
  await withStore('readingActivity', 'readwrite', async (store) => { await request(store.delete(workId)); });
  broadcast('readingActivity', workId);
}

export async function getAnnotations(): Promise<AnnotationRecord[]> {
  return withStore('annotations', 'readonly', async (store) => {
    const values = await request<AnnotationRecord[]>(store.getAll());
    return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export async function deleteAnnotation(id: string): Promise<void> {
  await withStore('annotations', 'readwrite', async (store) => { await request(store.delete(id)); });
  broadcast('annotations');
}

export async function getLibraryDbPortabilitySnapshot(): Promise<LibraryDbPortabilitySnapshot> {
  const db = await openLibraryDb();
  try {
    const transaction = db.transaction(['favorites', 'progress', 'legacyProgress', 'bookmarks', 'annotations', 'readingActivity'], 'readonly');
    const completion = transactionCompletion(transaction);
    const [favoriteValues, progressValues, legacyValues, bookmarks, annotations, activityValues] = await Promise.all([
      request<unknown[]>(transaction.objectStore('favorites').getAll()),
      request<unknown[]>(transaction.objectStore('progress').getAll()),
      request<unknown[]>(transaction.objectStore('legacyProgress').getAll()),
      request<unknown[]>(transaction.objectStore('bookmarks').getAll()),
      request<unknown[]>(transaction.objectStore('annotations').getAll()),
      request<unknown[]>(transaction.objectStore('readingActivity').getAll()),
    ]);
    await completion;

    const legacyByWork = new Map<string, StoredLegacyProgressRecordV1>();
    for (const value of [...legacyValues, ...progressValues]) {
      const record = normalizeLegacyProgressRecord(value);
      if (!record) continue;
      const existing = legacyByWork.get(record.workId);
      if (!existing || record.updatedAt > existing.updatedAt) legacyByWork.set(record.workId, record);
    }

    return {
      favorites: favoriteValues.map(normalizeFavoriteRecord).filter((record): record is FavoriteRecord => Boolean(record)),
      epubProgress: progressValues.filter(isReaderProgressRecordV2),
      legacyProgress: [...legacyByWork.values()],
      bookmarks,
      annotations,
      readingActivity: activityValues.filter(isReadingActivityRecordV1),
    };
  } finally {
    db.close();
  }
}

export async function replaceLibraryDbPortabilitySnapshot(patch: LibraryDbPortabilityPatch): Promise<void> {
  const requested = new Set<StoreName>();
  if (patch.favorites) requested.add('favorites');
  if (patch.epubProgress) requested.add('progress');
  if (patch.legacyProgress) requested.add('legacyProgress');
  if (patch.bookmarks) requested.add('bookmarks');
  if (patch.annotations) requested.add('annotations');
  if (patch.readingActivity) requested.add('readingActivity');
  if (requested.size === 0) return;

  const db = await openLibraryDb();
  try {
    const transaction = db.transaction([...requested], 'readwrite');
    const completion = transactionCompletion(transaction);
    const operations: Array<Promise<unknown>> = [];
    const replace = (name: StoreName, records: readonly unknown[]) => {
      const store = transaction.objectStore(name);
      operations.push(request(store.clear()));
      for (const record of records) operations.push(request(store.put(record)));
    };
    if (patch.favorites) replace('favorites', patch.favorites);
    if (patch.epubProgress) replace('progress', patch.epubProgress);
    if (patch.legacyProgress) replace('legacyProgress', patch.legacyProgress);
    if (patch.bookmarks) replace('bookmarks', patch.bookmarks);
    if (patch.annotations) replace('annotations', patch.annotations);
    if (patch.readingActivity) replace('readingActivity', patch.readingActivity);

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
  broadcast('restore');
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
