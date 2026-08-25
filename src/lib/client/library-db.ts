const DB_NAME = 'thiepn-library';
const DB_VERSION = 6;
const CHANNEL = 'thiepn-library';

export type StoreName =
  | 'recent'
  | 'progress'
  | 'bookmarks'
  | 'favorites'
  | 'history'
  | 'annotations'
  | 'annotationStats'
  | 'readingSessions';

export interface FavoriteRecord {
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

export type StoredProgressRecord = ProgressRecord | ReaderProgressRecordV2;

export interface AnnotationRecord {
  id: string;
  workId: string;
  chapterId?: string;
  quote?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

const storeDefinitions: Array<[StoreName, string]> = [
  ['recent', 'workId'],
  ['progress', 'workId'],
  ['bookmarks', 'id'],
  ['favorites', 'workId'],
  ['history', 'workId'],
  ['annotations', 'id'],
  ['annotationStats', 'workId'],
  ['readingSessions', 'id'],
];

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('IndexedDB request failed')));
  });
}

export function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.addEventListener('upgradeneeded', () => {
      const db = open.result;
      for (const [name, keyPath] of storeDefinitions) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
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

function isLegacyProgressRecord(value: unknown): value is ProgressRecord {
  if (typeof value !== 'object' || value === null || isReaderProgressRecordV2(value)) return false;
  const record = value as Partial<ProgressRecord>;
  return typeof record.workId === 'string'
    && typeof record.chapterId === 'string'
    && typeof record.percent === 'number'
    && Number.isFinite(record.percent)
    && typeof record.updatedAt === 'string';
}

export async function getFavoriteWorkIds(): Promise<string[]> {
  return withStore('favorites', 'readonly', async (store) => {
    const values = await request<FavoriteRecord[]>(store.getAll());
    return values.map((record) => record.workId);
  });
}

export async function isFavorite(workId: string): Promise<boolean> {
  return withStore('favorites', 'readonly', async (store) => Boolean(await request(store.get(workId))));
}

export async function setFavorite(workId: string, saved: boolean): Promise<void> {
  await withStore('favorites', 'readwrite', async (store) => {
    if (saved) await request(store.put({ workId, savedAt: new Date().toISOString() } satisfies FavoriteRecord));
    else await request(store.delete(workId));
  });
  broadcast('favorites', workId);
}

export async function toggleFavorite(workId: string): Promise<boolean> {
  const next = !(await isFavorite(workId));
  await setFavorite(workId, next);
  return next;
}

/** Legacy progress reader. Native EPUB records are intentionally invisible to the old chapter launcher. */
export async function getProgress(workId: string): Promise<ProgressRecord | undefined> {
  return withStore('progress', 'readonly', async (store) => {
    const stored = await request<StoredProgressRecord | undefined>(store.get(workId));
    return isLegacyProgressRecord(stored) ? stored : undefined;
  });
}

/** Legacy progress writer. It never overwrites a newer native EPUB progress record. */
export async function setProgress(workId: string, progress: ProgressRecord): Promise<void> {
  if (progress.workId !== workId) throw new Error('Progress work identity mismatch');
  const next: ProgressRecord = {
    ...progress,
    percent: Math.min(100, Math.max(0, Number.isFinite(progress.percent) ? progress.percent : 0)),
  };
  let changed = false;
  await withStore('progress', 'readwrite', async (store) => {
    const existing = await request<StoredProgressRecord | undefined>(store.get(workId));
    if (isReaderProgressRecordV2(existing)) return;
    if (isLegacyProgressRecord(existing) && existing.percent > next.percent) return;
    await request(store.put(next));
    changed = true;
  });
  if (changed) broadcast('progress', workId);
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
