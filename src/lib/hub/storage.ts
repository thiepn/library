import { PERSONAL_INDEX_KEY, readConsent, validBook, type Book } from './contract';
const MAX_ROWS = 1024;
/** Open only existing schemas. Never create/upgrade native reading databases. */
export async function readRows(name: string, version: number, storeName: string, keysOnly = false): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    let absent = false;
    const open = indexedDB.open(name);
    open.onupgradeneeded = () => { absent = true; open.transaction?.abort(); };
    open.onerror = () => absent ? resolve([]) : reject(new Error('Device storage unavailable'));
    open.onblocked = () => reject(new Error('Device storage blocked'));
    open.onsuccess = () => {
      const db = open.result;
      if (db.version !== version || !db.objectStoreNames.contains(storeName)) { db.close(); reject(new Error('Unsupported device storage')); return; }
      const tx = db.transaction(storeName, 'readonly'), rows: unknown[] = [];
      const request = keysOnly ? tx.objectStore(storeName).openKeyCursor() : tx.objectStore(storeName).openCursor();
      let overflow = false;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (rows.length >= MAX_ROWS) { overflow = true; tx.abort(); return; }
        rows.push(keysOnly ? cursor.primaryKey : (cursor as IDBCursorWithValue).value); cursor.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(rows); };
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error(overflow ? 'Device library exceeds bounded coverage' : 'Device storage unavailable')); };
    };
  });
}
export function readPersonalIndex(): Book[] {
  const raw = localStorage.getItem(PERSONAL_INDEX_KEY);
  if (!raw) return [];
  if (raw.length > 400000) throw new Error('Unsupported personal metadata index');
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > MAX_ROWS || rows.some(row => !validBook(row) || !row.personalId)) throw new Error('Unsupported personal metadata index');
  return rows as Book[];
}
export function personalMetadata(book: { id: string; title: string; format: 'epub' | 'pdf'; sha256: string }): Book {
  const row: Book = { workId: `personal:${book.id}`, title: book.title, format: book.format, edition: 1, releaseVersion: `local-${book.sha256}`, slug: 'personal', personalId: book.id };
  if (!/^[a-f0-9]{64}$/.test(book.sha256) || !validBook(row)) throw new Error('Personal title or identity cannot be shared');
  return row;
}
/** Called by native import/delete only with already-loaded metadata; never reads book blobs. */
export function updatePersonalIndex(book: { id: string; title: string; format: 'epub' | 'pdf'; sha256: string } | string) {
  const consent = readConsent();
  if (!consent?.includePersonal || !consent.permissions.length) return;
  try {
    let rows = readPersonalIndex().filter(row => row.personalId !== (typeof book === 'string' ? book : book.id));
    if (typeof book !== 'string') rows.push(personalMetadata(book));
    if (rows.length > MAX_ROWS) throw new Error('Personal metadata limit');
    localStorage.setItem(PERSONAL_INDEX_KEY, JSON.stringify(rows));
  } catch {
    // Fail closed: reselect imported titles in Library to rebuild the index.
    try { localStorage.removeItem(PERSONAL_INDEX_KEY); } catch { /* Native import/delete must still succeed. */ }
  }
}
export async function availableBooks(catalogue: Book[], includePersonal: boolean): Promise<Book[]> {
  if (!includePersonal) return catalogue;
  const keys = await readRows('thiepn-library-personal-books', 3, 'books', true);
  return [...catalogue, ...readPersonalIndex().filter(row => keys.includes(row.personalId))];
}
