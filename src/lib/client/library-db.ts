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
    open.addEventListener('error', () => reject(open.error ?? new Error('Unable to open Library state'));
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
