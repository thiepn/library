import { openLibraryDb } from '../client/library-db';
import {
  BOOK_NOTE_MAX_BODY, BOOK_NOTE_MAX_TITLE, isBookNoteDocumentV1, normalizedChapterKey,
  type BookNoteDocumentV1, type BookNoteScope, type SourceAnchorV1,
} from './note-model';

const STORE = 'noteDocuments';
const CHANNEL = 'thiepn-library';
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  value.addEventListener('success', () => resolve(value.result), { once: true });
  value.addEventListener('error', () => reject(value.error ?? new Error('Notebook storage failed')), { once: true });
});

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Notebook transaction aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Notebook transaction failed')), { once: true });
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openLibraryDb();
  try {
    const transaction = db.transaction(STORE, mode);
    const completed = completion(transaction);
    try {
      const value = await operation(transaction.objectStore(STORE));
      await completed;
      return value;
    } catch (error) {
      try { transaction.abort(); } catch {}
      try { await completed; } catch {}
      throw error;
    }
  } finally {
    db.close();
  }
}

function notify(workId: string): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ kind: 'noteDocuments', workId, at: Date.now() });
    channel.close();
  } catch { /* Cross-tab notifications are best-effort. */ }
  window.dispatchEvent(new CustomEvent('library-notebook-changed', { detail: { workId } }));
}

export class NotebookConflictError extends Error {
  constructor() { super('This note was updated in another tab. Reload it before editing. Your unsaved text is still in the editor.'); this.name = 'NotebookConflictError'; }
}

export interface NewBookNote {
  workId: string;
  scope: BookNoteScope;
  title?: string;
  bodyMarkdown?: string;
  chapterKey?: string;
  anchor?: SourceAnchorV1;
}

export async function listBookNotes(workId?: string): Promise<BookNoteDocumentV1[]> {
  return withStore('readonly', async (store) => {
    const values: unknown[] = workId
      ? await request(store.index('workId').getAll(workId))
      : await request(store.getAll());
    return values.filter(isBookNoteDocumentV1)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  });
}

export async function getBookNote(id: string): Promise<BookNoteDocumentV1 | undefined> {
  const record = await withStore('readonly', (store) => request<unknown>(store.get(id)));
  return isBookNoteDocumentV1(record) ? record : undefined;
}

export async function createBookNote(input: NewBookNote): Promise<BookNoteDocumentV1> {
  const chapterKey = input.scope === 'chapter-summary' ? normalizedChapterKey(input.chapterKey ?? '') : undefined;
  if (!input.workId.trim() || input.workId.length > 250 ||
      (input.scope === 'chapter-summary' && !chapterKey)) throw new Error('Select a book and chapter before creating a note.');
  const now = new Date().toISOString();
  const record: BookNoteDocumentV1 = {
    schemaVersion: 1, id: crypto.randomUUID(), workId: input.workId,
    scope: input.scope,
    title: (input.title ?? (input.scope === 'book-overview' ? 'Book overview' : input.scope === 'chapter-summary' ? 'Chapter summary' : 'Reading note')).slice(0, BOOK_NOTE_MAX_TITLE),
    bodyMarkdown: (input.bodyMarkdown ?? '').slice(0, BOOK_NOTE_MAX_BODY),
    ...(chapterKey ? { chapterKey, scopeKey: 'chapter:' + chapterKey } : {}),
    ...(input.scope === 'book-overview' ? { scopeKey: 'overview' } : {}),
    ...(input.anchor ? { anchor: input.anchor } : {}),
    sourceAnnotations: [], createdAt: now, updatedAt: now, revision: 1,
  };
  if (!isBookNoteDocumentV1(record)) throw new Error('Invalid notebook document.');
  await withStore('readwrite', async (store) => { await request(store.add(record)); });
  notify(record.workId);
  return record;
}

export async function updateBookNote(
  id: string, expectedRevision: number, changes: Pick<BookNoteDocumentV1, 'title' | 'bodyMarkdown'>,
): Promise<BookNoteDocumentV1> {
  if (changes.title.length > BOOK_NOTE_MAX_TITLE || changes.bodyMarkdown.length > BOOK_NOTE_MAX_BODY)
    throw new Error('Notebook text exceeds the storage limit.');
  const next = await withStore('readwrite', async (store) => {
    const existing = await request<unknown>(store.get(id));
    if (!isBookNoteDocumentV1(existing)) throw new Error('Note no longer exists.');
    if (existing.revision !== expectedRevision) throw new NotebookConflictError();
    const updated: BookNoteDocumentV1 = {
      ...existing, title: changes.title, bodyMarkdown: changes.bodyMarkdown,
      revision: existing.revision + 1, updatedAt: new Date().toISOString(),
    };
    await request(store.put(updated));
    return updated;
  });
  notify(next.workId);
  return next;
}

export async function deleteBookNote(id: string, expectedRevision: number): Promise<void> {
  const record = await withStore('readwrite', async (store) => {
    const existing = await request<unknown>(store.get(id));
    if (!isBookNoteDocumentV1(existing)) throw new Error('Note no longer exists.');
    if (existing.revision !== expectedRevision) throw new NotebookConflictError();
    await request(store.delete(id));
    return existing;
  });
  notify(record.workId);
}

export function subscribeBookNotes(listener: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.kind === 'noteDocuments') listener();
    });
  } catch {}
  const local = () => listener();
  window.addEventListener('library-notebook-changed', local);
  return () => { channel?.close(); window.removeEventListener('library-notebook-changed', local); };
}
