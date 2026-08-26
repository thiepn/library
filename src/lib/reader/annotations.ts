import type { ReaderController, ReaderControllerState } from './controller';
import {
  deleteReaderAnnotation,
  getReaderAnnotationsForWork,
  putReaderAnnotation,
  READER_ANNOTATION_MAX_NOTE,
  READER_ANNOTATION_SCHEMA_VERSION,
  subscribeReaderAnnotationChanges,
  type ReaderAnnotationIdentity,
  type ReaderAnnotationRecordV2,
} from './annotation-store';
import { ReaderAnnotationHighlighter } from './annotation-highlighter';
import type { ReaderShellController } from './shell';
import type { ReaderLocation, ReaderSelection, ReaderTocItem, Unsubscribe } from './types';

export type ReaderAnnotationSort = 'reading-order' | 'newest';
export type ReaderAnnotationStorageMode = 'persistent' | 'session';
export type ReaderAnnotationsStatus = 'loading' | 'ready' | 'error';

export interface ReaderAnnotationsState {
  open: boolean;
  status: ReaderAnnotationsStatus;
  storageMode: ReaderAnnotationStorageMode;
  items: ReaderAnnotationRecordV2[];
  staleCount: number;
  filter: string;
  sort: ReaderAnnotationSort;
  selectionActive: boolean;
  editingId: string | undefined;
  message: string;
}

export interface ReaderAnnotationsControllerOptions {
  identity: ReaderAnnotationIdentity;
  maxAnnotations?: number;
}

interface PendingSelection {
  selection: ReaderSelection;
  location: ReaderLocation;
}

interface AnnotationUi {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  close: HTMLButtonElement;
  filter: HTMLInputElement;
  sort: HTMLSelectElement;
  stale: HTMLElement;
  status: HTMLElement;
  list: HTMLOListElement;
  empty: HTMLElement;
  editor: HTMLElement;
  editorQuote: HTMLElement;
  editorNote: HTMLTextAreaElement;
  editorSave: HTMLButtonElement;
  editorCancel: HTMLButtonElement;
  selectionBar: HTMLElement;
  selectionQuote: HTMLElement;
  selectionHighlight: HTMLButtonElement;
  selectionNote: HTMLButtonElement;
  selectionDismiss: HTMLButtonElement;
}

export const READER_ANNOTATION_MAX_PER_RELEASE = 1000;
let annotationPanelSequence = 0;

function normalizeHref(value: string): string {
  let decoded = value.split('#')[0]?.split('?')[0] ?? '';
  try { decoded = decodeURIComponent(decoded); } catch {}
  return decoded.replace(/^\.\//, '').replace(/^\//, '').toLowerCase();
}

function flattenToc(items: ReaderTocItem[], output: ReaderTocItem[] = []): ReaderTocItem[] {
  for (const item of items) {
    output.push(item);
    flattenToc(item.children, output);
  }
  return output;
}

function resolveChapterLabel(location: ReaderLocation, toc: ReaderTocItem[]): string {
  const target = normalizeHref(location.href);
  const flat = flattenToc(toc, []);
  const exact = flat.find((item) => normalizeHref(item.href) === target);
  if (exact?.label.trim()) return exact.label.trim();
  const suffix = flat.find((item) => {
    const candidate = normalizeHref(item.href);
    return candidate && target && (candidate.endsWith(target) || target.endsWith(candidate));
  });
  if (suffix?.label.trim()) return suffix.label.trim();
  return `Section ${Math.max(1, location.index + 1)}`;
}

function createAnnotationUi(root: HTMLElement): AnnotationUi {
  const cluster = root.querySelector<HTMLElement>('.reader-shell__cluster--end');
  if (!cluster) throw new Error('Reader annotations require the top reader control cluster.');
  const bookmarksButton = cluster.querySelector<HTMLElement>('[data-reader-bookmarks-toggle]');
  const searchButton = cluster.querySelector<HTMLElement>('[data-reader-search-toggle]');
  const appearanceButton = cluster.querySelector<HTMLElement>('[data-reader-command="appearance"]');
  const id = `reader-annotations-panel-${++annotationPanelSequence}`;

  const toggle = document.createElement('button');
  toggle.className = 'reader-shell__icon-button reader-annotations-toggle';
  toggle.type = 'button';
  toggle.dataset.readerAnnotationsToggle = '';
  toggle.setAttribute('aria-label', 'Highlights and notes');
  toggle.setAttribute('title', 'Highlights and notes');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 7.7-7.7 3 3L9 18H6z"></path><path d="M5 20h14"></path></svg>';
  const anchor = bookmarksButton ?? searchButton ?? appearanceButton;
  if (anchor) cluster.insertBefore(toggle, anchor);
  else cluster.append(toggle);

  const panel = document.createElement('section');
  panel.className = 'reader-annotations-panel';
  panel.id = id;
  panel.dataset.readerAnnotationsPanel = '';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Highlights and notes');
  panel.innerHTML = `
    <div class="reader-annotations-panel__heading">
      <div><p>Book</p><h2>Highlights & notes</h2></div>
      <button type="button" class="reader-annotations-panel__close" data-reader-annotations-close aria-label="Close highlights and notes">×</button>
    </div>
    <section class="reader-annotation-editor" data-reader-annotation-editor hidden aria-label="Annotation editor">
      <blockquote data-reader-annotation-editor-quote></blockquote>
      <label><span>Note</span><textarea data-reader-annotation-editor-note rows="5" maxlength="${READER_ANNOTATION_MAX_NOTE}" placeholder="Add a note about this passage"></textarea></label>
      <div class="reader-annotation-editor__actions">
        <button type="button" data-reader-annotation-editor-save>Save note</button>
        <button type="button" data-reader-annotation-editor-cancel>Cancel</button>
      </div>
    </section>
    <div class="reader-annotations-tools">
      <label><span>Filter</span><input type="search" data-reader-annotations-filter autocomplete="off" placeholder="Find text, chapter, or note" /></label>
      <label><span>Sort</span><select data-reader-annotations-sort><option value="reading-order">Reading order</option><option value="newest">Newest first</option></select></label>
    </div>
    <p class="reader-annotations-stale" data-reader-annotations-stale hidden></p>
    <p class="reader-annotations-status" data-reader-annotations-status role="status" aria-live="polite">Loading annotations…</p>
    <div class="reader-annotations-list-wrap">
      <ol class="reader-annotations-list" data-reader-annotations-list aria-label="Saved highlights and notes"></ol>
      <p class="reader-annotations-empty" data-reader-annotations-empty hidden>No highlights yet. Select text in the book to begin.</p>
    </div>
  `;

  const selectionBar = document.createElement('section');
  selectionBar.className = 'reader-selection-actions';
  selectionBar.dataset.readerSelectionActions = '';
  selectionBar.hidden = true;
  selectionBar.setAttribute('role', 'toolbar');
  selectionBar.setAttribute('aria-label', 'Selected text actions');
  selectionBar.innerHTML = `
    <p data-reader-selection-quote></p>
    <div>
      <button type="button" data-reader-selection-highlight>Highlight</button>
      <button type="button" data-reader-selection-note>Add note</button>
      <button type="button" data-reader-selection-dismiss aria-label="Dismiss selected text actions">×</button>
    </div>
  `;

  const stage = root.querySelector<HTMLElement>('[data-reader-stage]');
  root.insertBefore(panel, stage ?? null);
  root.append(selectionBar);

  const close = panel.querySelector<HTMLButtonElement>('[data-reader-annotations-close]');
  const filter = panel.querySelector<HTMLInputElement>('[data-reader-annotations-filter]');
  const sort = panel.querySelector<HTMLSelectElement>('[data-reader-annotations-sort]');
  const stale = panel.querySelector<HTMLElement>('[data-reader-annotations-stale]');
  const status = panel.querySelector<HTMLElement>('[data-reader-annotations-status]');
  const list = panel.querySelector<HTMLOListElement>('[data-reader-annotations-list]');
  const empty = panel.querySelector<HTMLElement>('[data-reader-annotations-empty]');
  const editor = panel.querySelector<HTMLElement>('[data-reader-annotation-editor]');
  const editorQuote = panel.querySelector<HTMLElement>('[data-reader-annotation-editor-quote]');
  const editorNote = panel.querySelector<HTMLTextAreaElement>('[data-reader-annotation-editor-note]');
  const editorSave = panel.querySelector<HTMLButtonElement>('[data-reader-annotation-editor-save]');
  const editorCancel = panel.querySelector<HTMLButtonElement>('[data-reader-annotation-editor-cancel]');
  const selectionQuote = selectionBar.querySelector<HTMLElement>('[data-reader-selection-quote]');
  const selectionHighlight = selectionBar.querySelector<HTMLButtonElement>('[data-reader-selection-highlight]');
  const selectionNote = selectionBar.querySelector<HTMLButtonElement>('[data-reader-selection-note]');
  const selectionDismiss = selectionBar.querySelector<HTMLButtonElement>('[data-reader-selection-dismiss]');
  if (!close || !filter || !sort || !stale || !status || !list || !empty || !editor || !editorQuote || !editorNote || !editorSave || !editorCancel || !selectionQuote || !selectionHighlight || !selectionNote || !selectionDismiss) {
    throw new Error('Reader annotations UI could not initialize.');
  }
  return { toggle, panel, close, filter, sort, stale, status, list, empty, editor, editorQuote, editorNote, editorSave, editorCancel, selectionBar, selectionQuote, selectionHighlight, selectionNote, selectionDismiss };
}

function createAnnotationId(identity: ReaderAnnotationIdentity): string {
  let token = '';
  try { token = crypto.randomUUID(); } catch { token = `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  return `reader-annotation:${identity.workId}:${token}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved';
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date); }
  catch { return 'Saved'; }
}

export class ReaderAnnotationsController {
  private readonly controller: ReaderController;
  private readonly shell: ReaderShellController;
  private readonly identity: ReaderAnnotationIdentity;
  private readonly maxAnnotations: number;
  private readonly ui: AnnotationUi;
  private readonly highlighter: ReaderAnnotationHighlighter;
  private readonly listeners = new Set<(state: ReaderAnnotationsState) => void>();
  private cleanups: Unsubscribe[] = [];
  private pendingSelection: PendingSelection | undefined;
  private draftSelection: PendingSelection | undefined;
  private storageAvailable = true;
  private refreshRevision = 0;
  private operation: Promise<void> = Promise.resolve();
  private started = false;
  private destroyed = false;
  private lastLocationCfi: string | undefined;
  private state: ReaderAnnotationsState = {
    open: false,
    status: 'loading',
    storageMode: 'persistent',
    items: [],
    staleCount: 0,
    filter: '',
    sort: 'reading-order',
    selectionActive: false,
    editingId: undefined,
    message: 'Loading annotations…',
  };

  constructor(controller: ReaderController, shell: ReaderShellController, options: ReaderAnnotationsControllerOptions) {
    this.controller = controller;
    this.shell = shell;
    this.identity = { ...options.identity };
    this.maxAnnotations = Math.max(1, Math.min(4000, Math.round(options.maxAnnotations ?? READER_ANNOTATION_MAX_PER_RELEASE)));
    this.ui = createAnnotationUi(shell.root);
    this.highlighter = new ReaderAnnotationHighlighter(shell.viewport);
    this.renderChrome();
    this.renderList();
  }

  get snapshot(): ReaderAnnotationsState {
    return { ...this.state, items: this.state.items.map((item) => ({ ...item })) };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;
    this.ui.toggle.addEventListener('click', this.handleToggle);
    this.ui.close.addEventListener('click', this.handleClose);
    this.ui.filter.addEventListener('input', this.handleFilter);
    this.ui.sort.addEventListener('change', this.handleSort);
    this.ui.list.addEventListener('click', this.handleListClick);
    this.ui.list.addEventListener('keydown', this.handleListKeydown);
    this.ui.selectionHighlight.addEventListener('click', this.handleSelectionHighlight);
    this.ui.selectionNote.addEventListener('click', this.handleSelectionNote);
    this.ui.selectionDismiss.addEventListener('click', this.handleSelectionDismiss);
    this.ui.editorSave.addEventListener('click', this.handleEditorSave);
    this.ui.editorCancel.addEventListener('click', this.handleEditorCancel);
    this.ui.editorNote.addEventListener('keydown', this.handleEditorKeydown);
    document.addEventListener('keydown', this.handleDocumentKeydown, true);

    this.cleanups.push(this.shell.onCommand((command) => {
      if (command === 'appearance' || command === 'more' || command === 'contents') {
        this.close(false);
        this.dismissSelection();
      }
    }));
    this.cleanups.push(this.controller.subscribe((reader) => this.syncReaderState(reader)));
    this.cleanups.push(this.controller.onSelection((selection) => this.handleSelection(selection)));
    this.cleanups.push(subscribeReaderAnnotationChanges(this.identity.workId, () => {
      if (this.storageAvailable) void this.refresh();
    }));
    void this.refresh();
  }

  subscribe(listener: (state: ReaderAnnotationsState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  open(): void {
    this.assertUsable();
    if (this.controller.snapshot.status !== 'ready' || this.state.open) return;
    this.shell.setAppearancePanelOpen(false);
    this.shell.setModePanelOpen(false);
    this.ui.panel.hidden = false;
    this.ui.toggle.setAttribute('aria-expanded', 'true');
    this.patchState({ open: true });
    queueMicrotask(() => {
      if (!this.destroyed && this.state.open) this.ui.filter.focus({ preventScroll: true });
    });
  }

  close(returnFocus = true): void {
    if (this.destroyed || !this.state.open) return;
    this.cancelEditor(false);
    this.ui.panel.hidden = true;
    this.ui.toggle.setAttribute('aria-expanded', 'false');
    this.patchState({ open: false });
    if (returnFocus) this.ui.toggle.focus({ preventScroll: true });
  }

  toggle(): void {
    if (this.state.open) this.close();
    else this.open();
  }

  dismissSelection(): void {
    this.pendingSelection = undefined;
    this.ui.selectionBar.hidden = true;
    if (this.state.selectionActive) this.patchState({ selectionActive: false });
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.storageAvailable) return;
      const revision = ++this.refreshRevision;
      this.patchState({ status: 'loading', message: 'Loading annotations…' });
      try {
        const all = await getReaderAnnotationsForWork(this.identity.workId);
        if (this.destroyed || revision !== this.refreshRevision) return;
        const exact = all.filter((annotation) => this.matchesRelease(annotation));
        this.patchState({
          status: 'ready',
          storageMode: 'persistent',
          items: exact,
          staleCount: all.length - exact.length,
          message: exact.length ? `${exact.length} highlight${exact.length === 1 ? '' : 's'} saved.` : 'No highlights saved in this edition.',
        }, true);
        this.syncHighlights();
      } catch {
        if (this.destroyed || revision !== this.refreshRevision) return;
        this.storageAvailable = false;
        this.patchState({
          status: 'ready',
          storageMode: 'session',
          staleCount: 0,
          message: 'Browser storage is unavailable. New highlights and notes will last for this reading session only.',
        });
      }
    });
  }

  async goTo(id: string): Promise<void> {
    this.assertUsable();
    const annotation = this.state.items.find((item) => item.id === id && this.matchesRelease(item));
    if (!annotation) return;
    try {
      await this.controller.goTo(annotation.cfiRange);
      this.close(false);
      this.shell.viewport.focus({ preventScroll: true });
      this.shell.announce(`Opened highlight in ${annotation.chapterLabel}`);
    } catch (error) {
      this.patchState({ status: 'error', message: error instanceof Error ? error.message : 'Unable to open this highlight.' });
    }
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const annotation = this.state.items.find((item) => item.id === id);
      if (!annotation) return;
      if (this.storageAvailable) {
        try { await deleteReaderAnnotation(annotation.id, this.identity.workId); }
        catch { this.storageAvailable = false; }
      }
      const items = this.state.items.filter((item) => item.id !== id);
      if (this.state.editingId === id) this.cancelEditor(false);
      this.patchState({
        status: 'ready',
        storageMode: this.storageAvailable ? 'persistent' : 'session',
        items,
        message: this.storageAvailable ? 'Highlight deleted.' : 'Highlight removed for this session only.',
      }, true);
      this.syncHighlights();
      this.shell.announce('Highlight deleted');
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.refreshRevision += 1;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.ui.toggle.removeEventListener('click', this.handleToggle);
    this.ui.close.removeEventListener('click', this.handleClose);
    this.ui.filter.removeEventListener('input', this.handleFilter);
    this.ui.sort.removeEventListener('change', this.handleSort);
    this.ui.list.removeEventListener('click', this.handleListClick);
    this.ui.list.removeEventListener('keydown', this.handleListKeydown);
    this.ui.selectionHighlight.removeEventListener('click', this.handleSelectionHighlight);
    this.ui.selectionNote.removeEventListener('click', this.handleSelectionNote);
    this.ui.selectionDismiss.removeEventListener('click', this.handleSelectionDismiss);
    this.ui.editorSave.removeEventListener('click', this.handleEditorSave);
    this.ui.editorCancel.removeEventListener('click', this.handleEditorCancel);
    this.ui.editorNote.removeEventListener('keydown', this.handleEditorKeydown);
    document.removeEventListener('keydown', this.handleDocumentKeydown, true);
    this.highlighter.destroy();
    this.ui.panel.remove();
    this.ui.selectionBar.remove();
    this.ui.toggle.remove();
    this.listeners.clear();
  }

  private syncReaderState(reader: ReaderControllerState): void {
    this.ui.toggle.disabled = reader.status !== 'ready';
    if (reader.status !== 'ready') {
      this.close(false);
      this.dismissSelection();
      this.highlighter.set([]);
      return;
    }
    const nextCfi = reader.location?.cfi;
    if (this.lastLocationCfi && nextCfi && nextCfi !== this.lastLocationCfi && this.pendingSelection) this.dismissSelection();
    this.lastLocationCfi = nextCfi;
    this.syncHighlights();
  }

  private handleSelection(selection: ReaderSelection): void {
    const text = selection.text.trim();
    const location = this.controller.snapshot.location;
    if (!text || !selection.cfiRange.startsWith('epubcfi(') || !location || this.controller.snapshot.status !== 'ready') return;
    this.pendingSelection = { selection: { cfiRange: selection.cfiRange, text }, location: { ...location } };
    this.ui.selectionQuote.textContent = text.length > 180 ? `${text.slice(0, 177)}…` : text;
    this.ui.selectionBar.hidden = false;
    this.patchState({ selectionActive: true });
  }

  private async createFromSelection(note: string): Promise<void> {
    const pending = this.pendingSelection ?? this.draftSelection;
    if (!pending) return;
    const duplicate = this.state.items.find((item) => item.cfiRange === pending.selection.cfiRange);
    if (duplicate) {
      if (note.trim()) {
        this.beginEdit(duplicate.id);
        this.ui.editorNote.value = note.slice(0, READER_ANNOTATION_MAX_NOTE);
      } else {
        this.patchState({ status: 'ready', message: 'This passage is already highlighted.' });
        this.shell.announce('Already highlighted');
      }
      this.dismissSelection();
      return;
    }
    if (this.state.items.length >= this.maxAnnotations) {
      this.patchState({ status: 'error', message: `This edition is limited to ${this.maxAnnotations} annotations.` });
      return;
    }
    const now = new Date().toISOString();
    const location = pending.location;
    const record: ReaderAnnotationRecordV2 = {
      schemaVersion: READER_ANNOTATION_SCHEMA_VERSION,
      id: createAnnotationId(this.identity),
      ...this.identity,
      cfiRange: pending.selection.cfiRange,
      href: location.href,
      chapterLabel: resolveChapterLabel(location, this.controller.snapshot.toc),
      spineIndex: Math.max(0, location.index),
      ...(location.percentage === undefined ? {} : { percentage: Math.max(0, Math.min(1, location.percentage)) }),
      quote: pending.selection.text,
      note: note.slice(0, READER_ANNOTATION_MAX_NOTE),
      createdAt: now,
      updatedAt: now,
    };
    await this.persist(record);
    this.patchState({
      status: 'ready',
      storageMode: this.storageAvailable ? 'persistent' : 'session',
      items: [...this.state.items, record],
      message: note.trim() ? 'Highlight and note saved.' : 'Highlight saved.',
    }, true);
    this.pendingSelection = undefined;
    this.draftSelection = undefined;
    this.ui.selectionBar.hidden = true;
    this.patchState({ selectionActive: false });
    this.syncHighlights();
    this.shell.announce(note.trim() ? 'Highlight and note saved' : 'Highlight saved');
  }

  private beginNoteFromSelection(): void {
    if (!this.pendingSelection) return;
    const duplicate = this.state.items.find((item) => item.cfiRange === this.pendingSelection?.selection.cfiRange);
    if (duplicate) {
      this.beginEdit(duplicate.id);
      this.dismissSelection();
      return;
    }
    this.draftSelection = this.pendingSelection;
    this.pendingSelection = undefined;
    this.ui.selectionBar.hidden = true;
    this.patchState({ selectionActive: false, editingId: undefined });
    this.open();
    this.ui.editor.hidden = false;
    this.ui.editorQuote.textContent = this.draftSelection.selection.text;
    this.ui.editorNote.value = '';
    queueMicrotask(() => this.ui.editorNote.focus({ preventScroll: true }));
  }

  private beginEdit(id: string): void {
    const item = this.state.items.find((annotation) => annotation.id === id);
    if (!item) return;
    this.draftSelection = undefined;
    this.open();
    this.patchState({ editingId: id });
    this.ui.editor.hidden = false;
    this.ui.editorQuote.textContent = item.quote;
    this.ui.editorNote.value = item.note;
    queueMicrotask(() => this.ui.editorNote.focus({ preventScroll: true }));
  }

  private saveEditor(): Promise<void> {
    return this.enqueue(async () => {
      const note = this.ui.editorNote.value.slice(0, READER_ANNOTATION_MAX_NOTE);
      if (this.state.editingId) {
        const item = this.state.items.find((annotation) => annotation.id === this.state.editingId);
        if (!item) return;
        const next: ReaderAnnotationRecordV2 = { ...item, note, updatedAt: new Date().toISOString() };
        await this.persist(next);
        const items = this.state.items.map((annotation) => annotation.id === next.id ? next : annotation);
        this.cancelEditor(false);
        this.patchState({ status: 'ready', storageMode: this.storageAvailable ? 'persistent' : 'session', items, message: note.trim() ? 'Note updated.' : 'Note removed; highlight kept.' }, true);
        this.syncHighlights();
        this.shell.announce(note.trim() ? 'Note updated' : 'Note removed');
        return;
      }
      if (!this.draftSelection) return;
      if (!note.trim()) {
        this.patchState({ status: 'error', message: 'Write a note before saving, or use Highlight for a highlight without a note.' });
        this.ui.editorNote.focus();
        return;
      }
      await this.createFromSelection(note);
      this.cancelEditor(false);
    });
  }

  private cancelEditor(focusFilter = true): void {
    this.draftSelection = undefined;
    if (this.state.editingId !== undefined) this.patchState({ editingId: undefined });
    this.ui.editor.hidden = true;
    this.ui.editorNote.value = '';
    this.ui.editorQuote.textContent = '';
    if (focusFilter && this.state.open) this.ui.filter.focus({ preventScroll: true });
  }

  private async persist(record: ReaderAnnotationRecordV2): Promise<void> {
    if (!this.storageAvailable) return;
    try { await putReaderAnnotation(record); }
    catch { this.storageAvailable = false; }
  }

  private syncHighlights(): void {
    const location = this.controller.snapshot.location;
    if (!location || this.controller.snapshot.status !== 'ready') {
      this.highlighter.set([]);
      return;
    }
    const nearby = this.state.items.filter((item) => Math.abs(item.spineIndex - location.index) <= 1);
    this.highlighter.set(nearby);
  }

  private matchesRelease(annotation: ReaderAnnotationRecordV2): boolean {
    return annotation.workId === this.identity.workId
      && annotation.edition === this.identity.edition
      && annotation.releaseVersion === this.identity.releaseVersion;
  }

  private renderChrome(): void {
    this.ui.toggle.dataset.readerAnnotationCount = String(this.state.items.length);
    this.shell.root.dataset.readerAnnotationStorage = this.state.storageMode;
    this.ui.status.textContent = this.state.message;
    this.ui.stale.hidden = this.state.staleCount === 0;
    this.ui.stale.textContent = this.state.staleCount === 0
      ? ''
      : `${this.state.staleCount} annotation${this.state.staleCount === 1 ? '' : 's'} from another edition or release are kept separately.`;
  }

  private renderList(): void {
    const query = this.state.filter.trim().toLocaleLowerCase();
    let items = this.state.items.filter((item) => {
      if (!query) return true;
      return `${item.chapterLabel}\n${item.quote}\n${item.note}`.toLocaleLowerCase().includes(query);
    });
    items = [...items].sort((a, b) => this.state.sort === 'newest'
      ? b.updatedAt.localeCompare(a.updatedAt)
      : a.spineIndex - b.spineIndex || a.cfiRange.localeCompare(b.cfiRange));

    this.ui.list.replaceChildren();
    this.ui.empty.hidden = items.length !== 0;
    this.ui.empty.textContent = this.state.items.length === 0 ? 'No highlights yet. Select text in the book to begin.' : 'No annotations match this filter.';
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'reader-annotation-item';
      li.dataset.readerAnnotationId = item.id;
      const meta = document.createElement('p');
      meta.className = 'reader-annotation-item__meta';
      const percentage = item.percentage === undefined ? '' : `${Math.round(item.percentage * 100)}% · `;
      meta.textContent = `${item.chapterLabel} · ${percentage}${formatDate(item.updatedAt)}`;
      const quote = document.createElement('blockquote');
      quote.textContent = item.quote;
      li.append(meta, quote);
      if (item.note.trim()) {
        const note = document.createElement('p');
        note.className = 'reader-annotation-item__note';
        note.textContent = item.note;
        li.append(note);
      }
      const actions = document.createElement('div');
      actions.className = 'reader-annotation-item__actions';
      const open = document.createElement('button');
      open.type = 'button';
      open.dataset.readerAnnotationOpen = item.id;
      open.textContent = 'Open';
      open.setAttribute('aria-label', `Open highlight in ${item.chapterLabel}`);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.dataset.readerAnnotationEdit = item.id;
      edit.textContent = item.note.trim() ? 'Edit note' : 'Add note';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.readerAnnotationDelete = item.id;
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete highlight in ${item.chapterLabel}`);
      actions.append(open, edit, remove);
      li.append(actions);
      this.ui.list.append(li);
    }
  }

  private patchState(patch: Partial<ReaderAnnotationsState>, rerenderList = false): void {
    this.state = { ...this.state, ...patch };
    this.renderChrome();
    if (rerenderList) this.renderList();
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.operation.then(task, task);
    this.operation = run.catch(() => undefined);
    return run;
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader annotations controller has been destroyed.');
  }

  private readonly handleToggle = () => this.toggle();
  private readonly handleClose = () => this.close();
  private readonly handleFilter = () => {
    this.patchState({ filter: this.ui.filter.value }, true);
  };
  private readonly handleSort = () => {
    const sort: ReaderAnnotationSort = this.ui.sort.value === 'newest' ? 'newest' : 'reading-order';
    this.patchState({ sort }, true);
  };
  private readonly handleSelectionHighlight = () => { void this.createFromSelection(''); };
  private readonly handleSelectionNote = () => this.beginNoteFromSelection();
  private readonly handleSelectionDismiss = () => this.dismissSelection();
  private readonly handleEditorSave = () => { void this.saveEditor(); };
  private readonly handleEditorCancel = () => this.cancelEditor();
  private readonly handleEditorKeydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.saveEditor();
    }
  };
  private readonly handleListClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const open = target?.closest<HTMLButtonElement>('[data-reader-annotation-open]');
    const edit = target?.closest<HTMLButtonElement>('[data-reader-annotation-edit]');
    const remove = target?.closest<HTMLButtonElement>('[data-reader-annotation-delete]');
    if (open?.dataset.readerAnnotationOpen) void this.goTo(open.dataset.readerAnnotationOpen);
    if (edit?.dataset.readerAnnotationEdit) this.beginEdit(edit.dataset.readerAnnotationEdit);
    if (remove?.dataset.readerAnnotationDelete) void this.remove(remove.dataset.readerAnnotationDelete);
  };
  private readonly handleListKeydown = (event: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(this.ui.list.querySelectorAll<HTMLButtonElement>('[data-reader-annotation-open]'));
    if (!buttons.length) return;
    const current = document.activeElement instanceof HTMLButtonElement ? buttons.indexOf(document.activeElement) : -1;
    let next = current;
    if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, current + 1);
    if (event.key === 'ArrowUp') next = Math.max(0, current < 0 ? 0 : current - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    const button = buttons[next];
    if (!button) return;
    event.preventDefault();
    button.focus();
  };
  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (!this.ui.selectionBar.hidden) {
      event.preventDefault();
      this.dismissSelection();
      return;
    }
    if (this.state.open) {
      event.preventDefault();
      this.close();
    }
  };
}
