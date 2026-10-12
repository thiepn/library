import type { BookNoteDocumentV1, BookNoteScope } from './note-model';

export const NOTEBOOK_VIEWS_KEY = 'thiepn.library.notebook.saved-views.v1';
export type NotebookViewMode = 'all' | 'connected' | 'unconnected';
export type NotebookViewSort = 'recent' | 'oldest' | 'title';
export interface NotebookViewFilters {
  query: string;
  workId: string;
  topic: string;
  scope: BookNoteScope | 'all';
  sort: NotebookViewSort;
  mode: NotebookViewMode;
}
export interface SavedNotebookView {
  id: string;
  name: string;
  filters: NotebookViewFilters;
  createdAt: string;
}
const MAX_VIEWS = 12;
const MAX_NAME = 64;
const defaults: NotebookViewFilters = {
  query: '', workId: 'all', topic: 'all', scope: 'all',
  sort: 'recent', mode: 'all',
};
export function defaultNotebookView(): NotebookViewFilters {
  return { ...defaults };
}
function isView(value: unknown): value is SavedNotebookView {
  if (!value || typeof value !== 'object') return false;
  const view = value as Partial<SavedNotebookView>;
  const filters = view.filters as Partial<NotebookViewFilters> | undefined;
  return typeof view.id === 'string' && view.id.length > 0 && view.id.length <= 96
    && typeof view.name === 'string' && view.name.trim().length > 0 && view.name.length <= MAX_NAME
    && typeof view.createdAt === 'string' && !Number.isNaN(Date.parse(view.createdAt))
    && !!filters
    && typeof filters.query === 'string' && filters.query.length <= 250
    && typeof filters.workId === 'string' && filters.workId.length <= 250
    && typeof filters.topic === 'string' && filters.topic.length <= 100
    && ['all','reading-note','chapter-summary','book-overview'].includes(filters.scope ?? '')
    && ['recent','oldest','title'].includes(filters.sort ?? '')
    && ['all','connected','unconnected'].includes(filters.mode ?? '');
}
export function readSavedNotebookViews(): SavedNotebookView[] {
  try {
    const raw = localStorage.getItem(NOTEBOOK_VIEWS_KEY);
    if (!raw) return [];
    const decoded: unknown = JSON.parse(raw);
    return Array.isArray(decoded) ? decoded.filter(isView).slice(0,MAX_VIEWS) : [];
  } catch { return []; }
}
export function saveNotebookView(
  name: string, filters: NotebookViewFilters,
): SavedNotebookView[] {
  const cleaned = name.normalize('NFKC').trim().slice(0, MAX_NAME);
  if (!cleaned) throw new Error('Name the workspace view before saving it.');
  const all = readSavedNotebookViews();
  const existing = all.find(view => view.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase());
  if (!existing && all.length >= MAX_VIEWS)
    throw new Error('You have 12 saved views. Remove one before adding another.');
  const next: SavedNotebookView = {
    id: existing?.id ?? crypto.randomUUID(),
    name: cleaned,
    filters: {
      query: filters.query.slice(0,250),
      workId: filters.workId.slice(0,250),
      topic: filters.topic.slice(0,100),
      scope: filters.scope,
      sort: filters.sort,
      mode: filters.mode,
    },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const result = [next,...all.filter(view => view.id !== next.id)];
  try { localStorage.setItem(NOTEBOOK_VIEWS_KEY, JSON.stringify(result)); }
  catch { throw new Error('This browser cannot save workspace preferences right now.'); }
  return result;
}
export function deleteNotebookView(id: string): SavedNotebookView[] {
  const all = readSavedNotebookViews();
  const next = all.filter(view => view.id !== id);
  try { localStorage.setItem(NOTEBOOK_VIEWS_KEY, JSON.stringify(next)); }
  catch { throw new Error('Could not remove this saved view.'); }
  return next;
}
export function filtersForSavedView(
  value: SavedNotebookView, works: ReadonlySet<string>, topics: ReadonlySet<string>,
): NotebookViewFilters {
  return {
    ...value.filters,
    workId: value.filters.workId === 'all' || works.has(value.filters.workId)
      ? value.filters.workId : 'all',
    topic: value.filters.topic === 'all' || topics.has(value.filters.topic)
      ? value.filters.topic : 'all',
  };
}
export function notebookViewConnectionIds(
  notes: readonly BookNoteDocumentV1[],
  outgoing: (note: BookNoteDocumentV1) => readonly string[],
): Set<string> {
  const known = new Set(notes.map(note => note.id));
  const result = new Set<string>();
  for (const note of notes) {
    for (const target of outgoing(note)) {
      if (!known.has(target) || target === note.id) continue;
      result.add(note.id);
      result.add(target);
    }
  }
  return result;
}
