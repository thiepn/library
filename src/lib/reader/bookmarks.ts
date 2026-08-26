import type { ReaderController } from './controller';
import {
  deleteReaderBookmark,
  getReaderBookmarksForWork,
  putReaderBookmark,
  subscribeReaderBookmarkChanges,
  READER_BOOKMARK_SCHEMA_VERSION,
  type ReaderBookmarkIdentity,
  type ReaderBookmarkRecordV2,
} from './bookmark-store';
import type { ReaderShellController } from './shell';
import type { ReaderLocation, ReaderTocItem, Unsubscribe } from './types';

export type ReaderBookmarkSort = 'reading-order' | 'newest';
export type ReaderBookmarkStorageMode = 'persistent' | 'session';
export type ReaderBookmarksStatus = 'loading' | 'ready' | 'error';

export interface ReaderBookmarksState {
  open: boolean;
  status: ReaderBookmarksStatus;
  storageMode: ReaderBookmarkStorageMode;
  items: ReaderBookmarkRecordV2[];
  staleCount: number;
  currentBookmarkId: string | undefined;
  filter: string;
  sort: ReaderBookmarkSort;
  message: string;
}

export interface ReaderBookmarksControllerOptions {
  identity: ReaderBookmarkIdentity;
  maxBookmarks?: number;
}

interface BookmarkUi {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  close: HTMLButtonElement;
  currentAction: HTMLButtonElement;
  filter: HTMLInputElement;
  sort: HTMLSelectElement;
  stale: HTMLElement;
  status: HTMLElement;
  list: HTMLOListElement;
  empty: HTMLElement;
}

export const READER_BOOKMARK_MAX_PER_RELEASE = 500;
let bookmarkPanelSequence = 0;

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

function createBookmarkUi(root: HTMLElement): BookmarkUi {
  const cluster = root.querySelector<HTMLElement>('.reader-shell__cluster--end');
  if (!cluster) throw new Error('Reader bookmarks require the top reader control cluster.');
  const searchButton = cluster.querySelector<HTMLElement>('[data-reader-search-toggle]');
  const appearanceButton = cluster.querySelector<HTMLElement>('[data-reader-command="appearance"]');
  const id = `reader-bookmarks-panel-${++bookmarkPanelSequence}`;

  const toggle = document.createElement('button');
  toggle.className = 'reader-shell__icon-button reader-bookmarks-toggle';
  toggle.type = 'button';
  toggle.dataset.readerBookmarksToggle = '';
  toggle.setAttribute('aria-label', 'Bookmarks');
  toggle.setAttribute('title', 'Bookmarks');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10v15l-5-3-5 3z"></path></svg>';
  const anchor = searchButton ?? appearanceButton;
  if (anchor) cluster.insertBefore(toggle, anchor);
  else cluster.append(toggle);

  const panel = document.createElement('section');
  panel.className = 'reader-bookmarks-panel';
  panel.id = id;
  panel.dataset.readerBookmarksPanel = '';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Bookmarks');
  panel.innerHTML = `
    <div class="reader-bookmarks-panel__heading">
      <div><p>Book</p><h2>Bookmarks</h2></div>
      <button type="button" class="reader-bookmarks-panel__close" data-reader-bookmarks-close aria-label="Close bookmarks">×</button>
    </div>
    <button type="button" class="reader-bookmarks-current" data-reader-bookmarks-current aria-pressed="false">Bookmark this location</button>
    <div class="reader-bookmarks-tools">
      <label>
        <span>Filter bookmarks</span>
        <input type="search" data-reader-bookmarks-filter autocomplete="off" placeholder="Find a chapter" />
      </label>
      <label>
        <span>Sort</span>
        <select data-reader-bookmarks-sort>
          <option value="reading-order">Reading order</option>
          <option value="newest">Newest first</option>
        </select>
      </label>
    </div>
    <p class="reader-bookmarks-stale" data-reader-bookmarks-stale hidden></p>
    <p class="reader-bookmarks-status" data-reader-bookmarks-status role="status" aria-live="polite">Loading bookmarks…</p>
    <div class="reader-bookmarks-list-wrap">
      <ol class="reader-bookmarks-list" data-reader-bookmarks-list aria-label="Saved bookmarks"></ol>
      <p class="reader-bookmarks-empty" data-reader-bookmarks-empty hidden>No bookmarks yet.</p>
    </div>
  `;
  const stage = root.querySelector<HTMLElement>('[data-reader-stage]');
  root.insertBefore(panel, stage ?? null);

  const close = panel.querySelector<HTMLButtonElement>('[data-reader-bookmarks-close]');
  const currentAction = panel.querySelector<HTMLButtonElement>('[data-reader-bookmarks-current]');
  const filter = panel.querySelector<HTMLInputElement>('[data-reader-bookmarks-filter]');
  const sort = panel.querySelector<HTMLSelectElement>('[data-reader-bookmarks-sort]');
  const stale = panel.querySelector<HTMLElement>('[data-reader-bookmarks-stale]');
  const status = panel.querySelector<HTMLElement>('[data-reader-bookmarks-status]');
  const list = panel.querySelector<HTMLOListElement>('[data-reader-bookmarks-list]');
  const empty = panel.querySelector<HTMLElement>('[data-reader-bookmarks-empty]');
  if (!close || !currentAction || !filter || !sort || !stale || !status || !list || !empty) {
    throw new Error('Reader bookmarks UI could not initialize.');
  }
  return { toggle, panel, close, currentAction, filter, sort, stale, status, list, empty };
}

function createBookmarkId(identity: ReaderBookmarkIdentity): string {
  let token = '';
  try { token = crypto.randomUUID(); } catch { token = `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  return `reader-bookmark:${identity.workId}:${token}`;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  } catch {
    return 'Saved';
  }
}

function bookmarkMeta(bookmark: ReaderBookmarkRecordV2): string {
  const percentage = bookmark.percentage === undefined ? '' : `${Math.round(bookmark.percentage * 100)}% · `;
  return `${percentage}${formatSavedAt(bookmark.createdAt)}`;
}

export class ReaderBookmarksController {
  private readonly controller: ReaderController;
  private readonly shell: ReaderShellController;
  private readonly identity: ReaderBookmarkIdentity;
  private readonly maxBookmarks: number;
  private readonly ui: BookmarkUi;
  private readonly listeners = new Set<(state: ReaderBookmarksState) => void>();
  private cleanups: Unsubscribe[] = [];
  private state: ReaderBookmarksState = {
    open: false,
    status: 'loading',
    storageMode: 'persistent',
    items: [],
    staleCount: 0,
    currentBookmarkId: undefined,
    filter: '',
    sort: 'reading-order',
    message: 'Loading bookmarks…',
  };
  private storageAvailable = true;
  private refreshRevision = 0;
  private operation: Promise<void> = Promise.resolve();
  private started = false;
  private destroyed = false;

  constructor(
    controller: ReaderController,
    shell: ReaderShellController,
    options: ReaderBookmarksControllerOptions,
  ) {
    this.controller = controller;
    this.shell = shell;
    this.identity = { ...options.identity };
    this.maxBookmarks = Math.max(1, Math.min(2000, Math.round(options.maxBookmarks ?? READER_BOOKMARK_MAX_PER_RELEASE)));
    this.ui = createBookmarkUi(shell.root);
    this.renderChrome();
    this.renderList();
  }

  get snapshot(): ReaderBookmarksState {
    return { ...this.state, items: this.state.items.map((item) => ({ ...item })) };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;
    this.ui.toggle.addEventListener('click', this.handleToggle);
    this.ui.close.addEventListener('click', this.handleClose);
    this.ui.currentAction.addEventListener('click', this.handleCurrentAction);
    this.ui.filter.addEventListener('input', this.handleFilter);
    this.ui.sort.addEventListener('change', this.handleSort);
    this.ui.list.addEventListener('click', this.handleListClick);
    this.ui.list.addEventListener('keydown', this.handleListKeydown);
    document.addEventListener('keydown', this.handleDocumentKeydown, true);
    this.shell.root.addEventListener('reader-shell:toggle-controls', this.handleShellToggle as EventListener);

    this.cleanups.push(this.shell.onCommand((command) => {
      if (command === 'appearance' || command === 'more' || command === 'contents') this.close(false);
    }));
    this.cleanups.push(this.controller.subscribe((reader) => {
      this.ui.toggle.disabled = reader.status !== 'ready';
      if (reader.status !== 'ready') this.close(false);
      this.syncCurrentBookmark();
    }));
    this.cleanups.push(subscribeReaderBookmarkChanges(this.identity.workId, () => {
      if (this.storageAvailable) void this.refresh();
    }));
    void this.refresh();
  }

  subscribe(listener: (state: ReaderBookmarksState) => void): Unsubscribe {
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
      if (!this.destroyed && this.state.open) {
        if (!this.ui.currentAction.disabled) this.ui.currentAction.focus({ preventScroll: true });
        else this.ui.filter.focus({ preventScroll: true });
      }
    });
  }

  close(returnFocus = true): void {
    if (this.destroyed || !this.state.open) return;
    this.ui.panel.hidden = true;
    this.ui.toggle.setAttribute('aria-expanded', 'false');
    this.patchState({ open: false });
    if (returnFocus) this.ui.toggle.focus({ preventScroll: true });
  }

  toggle(): void {
    if (this.state.open) this.close();
    else this.open();
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.storageAvailable) return;
      const revision = ++this.refreshRevision;
      this.patchState({ status: 'loading', message: 'Loading bookmarks…' });
      try {
        const all = await getReaderBookmarksForWork(this.identity.workId);
        if (this.destroyed || revision !== this.refreshRevision) return;
        const exact = all.filter((bookmark) => this.matchesRelease(bookmark));
        const staleCount = all.length - exact.length;
        this.patchState({
          status: 'ready',
          storageMode: 'persistent',
          items: exact,
          staleCount,
          message: exact.length === 0 ? 'No bookmarks saved in this edition.' : `${exact.length} bookmark${exact.length === 1 ? '' : 's'} saved.`,
        }, true);
        this.syncCurrentBookmark();
      } catch {
        if (this.destroyed || revision !== this.refreshRevision) return;
        this.storageAvailable = false;
        this.patchState({
          status: 'ready',
          storageMode: 'session',
          staleCount: 0,
          message: 'Browser storage is unavailable. New bookmarks will last for this reading session only.',
        });
      }
    });
  }

  toggleCurrent(): Promise<void> {
    return this.enqueue(async () => {
      const location = this.controller.snapshot.location;
      if (!location || this.controller.snapshot.status !== 'ready') return;
      const existing = this.state.items.find((bookmark) => bookmark.cfi === location.cfi);
      if (existing) {
        await this.removeNow(existing.id, true);
        return;
      }
      if (this.state.items.length >= this.maxBookmarks) {
        this.patchState({ status: 'error', message: `This edition is limited to ${this.maxBookmarks} bookmarks.` });
        return;
      }

      const now = new Date().toISOString();
      const bookmark: ReaderBookmarkRecordV2 = {
        schemaVersion: READER_BOOKMARK_SCHEMA_VERSION,
        id: createBookmarkId(this.identity),
        ...this.identity,
        cfi: location.cfi,
        href: location.href,
        chapterLabel: resolveChapterLabel(location, this.controller.snapshot.toc),
        spineIndex: Math.max(0, location.index),
        ...(location.percentage === undefined ? {} : { percentage: Math.max(0, Math.min(1, location.percentage)) }),
        createdAt: now,
        updatedAt: now,
      };

      if (this.storageAvailable) {
        try {
          await putReaderBookmark(bookmark);
        } catch {
          this.storageAvailable = false;
        }
      }
      const items = [...this.state.items, bookmark];
      this.patchState({
        status: 'ready',
        storageMode: this.storageAvailable ? 'persistent' : 'session',
        items,
        message: this.storageAvailable ? 'Bookmark saved.' : 'Bookmark saved for this session only.',
      }, true);
      this.syncCurrentBookmark();
      this.shell.announce('Bookmark saved');
    });
  }

  remove(id: string): Promise<void> {
    return this.enqueue(() => this.removeNow(id, false));
  }

  async goTo(id: string): Promise<void> {
    this.assertUsable();
    const bookmark = this.state.items.find((item) => item.id === id && this.matchesRelease(item));
    if (!bookmark) return;
    try {
      await this.controller.goTo(bookmark.cfi);
      this.close(false);
      this.shell.viewport.focus({ preventScroll: true });
      this.shell.announce(`Opened bookmark in ${bookmark.chapterLabel}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this bookmark.';
      this.patchState({ status: 'error', message });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.refreshRevision += 1;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.ui.toggle.removeEventListener('click', this.handleToggle);
    this.ui.close.removeEventListener('click', this.handleClose);
    this.ui.currentAction.removeEventListener('click', this.handleCurrentAction);
    this.ui.filter.removeEventListener('input', this.handleFilter);
    this.ui.sort.removeEventListener('change', this.handleSort);
    this.ui.list.removeEventListener('click', this.handleListClick);
    this.ui.list.removeEventListener('keydown', this.handleListKeydown);
    document.removeEventListener('keydown', this.handleDocumentKeydown, true);
    this.shell.root.removeEventListener('reader-shell:toggle-controls', this.handleShellToggle as EventListener);
    this.listeners.clear();
    this.ui.panel.remove();
    this.ui.toggle.remove();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.catch(() => undefined).then(operation);
    this.operation = next;
    return next;
  }

  private async removeNow(id: string, currentAction: boolean): Promise<void> {
    const bookmark = this.state.items.find((item) => item.id === id);
    if (!bookmark) return;
    if (this.storageAvailable) {
      try {
        await deleteReaderBookmark(bookmark.id, this.identity.workId);
      } catch {
        this.storageAvailable = false;
      }
    }
    const items = this.state.items.filter((item) => item.id !== id);
    this.patchState({
      status: 'ready',
      storageMode: this.storageAvailable ? 'persistent' : 'session',
      items,
      message: this.storageAvailable ? 'Bookmark removed.' : 'Bookmark removed from this session.',
    }, true);
    this.syncCurrentBookmark();
    this.shell.announce(currentAction ? 'Current bookmark removed' : 'Bookmark removed');
  }

  private matchesRelease(bookmark: ReaderBookmarkRecordV2): boolean {
    return bookmark.workId === this.identity.workId
      && bookmark.edition === this.identity.edition
      && bookmark.releaseVersion === this.identity.releaseVersion;
  }

  private syncCurrentBookmark(): void {
    const cfi = this.controller.snapshot.location?.cfi;
    const currentBookmarkId = cfi ? this.state.items.find((bookmark) => bookmark.cfi === cfi)?.id : undefined;
    if (currentBookmarkId === this.state.currentBookmarkId) {
      this.renderChrome();
      return;
    }
    this.patchState({ currentBookmarkId });
  }

  private visibleItems(): ReaderBookmarkRecordV2[] {
    const query = this.state.filter.trim().normalize('NFC').toLocaleLowerCase();
    const filtered = query
      ? this.state.items.filter((item) => `${item.chapterLabel} ${item.href}`.normalize('NFC').toLocaleLowerCase().includes(query))
      : [...this.state.items];
    if (this.state.sort === 'newest') return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filtered.sort((a, b) => {
      if (a.spineIndex !== b.spineIndex) return a.spineIndex - b.spineIndex;
      const aPercentage = a.percentage ?? Number.POSITIVE_INFINITY;
      const bPercentage = b.percentage ?? Number.POSITIVE_INFINITY;
      if (aPercentage !== bPercentage) return aPercentage - bPercentage;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  private renderChrome(): void {
    const readerReady = this.controller.snapshot.status === 'ready';
    const hasLocation = Boolean(this.controller.snapshot.location?.cfi);
    const currentSaved = Boolean(this.state.currentBookmarkId);
    this.ui.toggle.disabled = !readerReady;
    this.ui.toggle.setAttribute('aria-label', `Bookmarks, ${this.state.items.length} saved`);
    this.ui.currentAction.disabled = !readerReady || !hasLocation || this.state.status === 'loading';
    this.ui.currentAction.textContent = currentSaved ? 'Remove bookmark here' : 'Bookmark this location';
    this.ui.currentAction.setAttribute('aria-pressed', currentSaved ? 'true' : 'false');
    this.ui.currentAction.dataset.saved = currentSaved ? 'true' : 'false';
    this.ui.status.textContent = this.state.message;
    this.ui.panel.dataset.bookmarkStorage = this.state.storageMode;
    this.ui.sort.value = this.state.sort;
    if (this.ui.filter.value !== this.state.filter) this.ui.filter.value = this.state.filter;
    this.ui.stale.hidden = this.state.staleCount === 0;
    this.ui.stale.textContent = this.state.staleCount === 0
      ? ''
      : `${this.state.staleCount} bookmark${this.state.staleCount === 1 ? '' : 's'} from another edition or release are kept separately.`;
  }

  private renderList(): void {
    const items = this.visibleItems();
    this.ui.list.replaceChildren();
    this.ui.empty.hidden = items.length !== 0;
    this.ui.empty.textContent = this.state.items.length === 0
      ? 'No bookmarks yet.'
      : 'No bookmarks match this filter.';

    for (const bookmark of items) {
      const row = document.createElement('li');
      row.className = 'reader-bookmark';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'reader-bookmark__open';
      open.dataset.readerBookmarkOpen = bookmark.id;
      open.setAttribute('aria-label', `Open bookmark in ${bookmark.chapterLabel}`);

      const label = document.createElement('span');
      label.className = 'reader-bookmark__label';
      label.textContent = bookmark.chapterLabel;
      const meta = document.createElement('span');
      meta.className = 'reader-bookmark__meta';
      meta.textContent = bookmarkMeta(bookmark);
      open.append(label, meta);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'reader-bookmark__remove';
      remove.dataset.readerBookmarkRemove = bookmark.id;
      remove.setAttribute('aria-label', `Remove bookmark from ${bookmark.chapterLabel}`);
      remove.textContent = 'Remove';

      row.append(open, remove);
      this.ui.list.append(row);
    }
  }

  private patchState(patch: Partial<ReaderBookmarksState>, rerenderList = false): void {
    this.state = { ...this.state, ...patch };
    this.renderChrome();
    if (rerenderList) this.renderList();
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private openButtons(): HTMLButtonElement[] {
    return [...this.ui.list.querySelectorAll<HTMLButtonElement>('[data-reader-bookmark-open]')];
  }

  private readonly handleToggle = () => this.toggle();
  private readonly handleClose = () => this.close();
  private readonly handleCurrentAction = () => { void this.toggleCurrent(); };
  private readonly handleFilter = () => this.patchState({ filter: this.ui.filter.value }, true);
  private readonly handleSort = () => {
    const sort: ReaderBookmarkSort = this.ui.sort.value === 'newest' ? 'newest' : 'reading-order';
    this.patchState({ sort }, true);
  };
  private readonly handleListClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const remove = event.target.closest<HTMLButtonElement>('[data-reader-bookmark-remove]');
    if (remove && this.ui.list.contains(remove)) {
      void this.remove(remove.dataset.readerBookmarkRemove ?? '');
      return;
    }
    const open = event.target.closest<HTMLButtonElement>('[data-reader-bookmark-open]');
    if (open && this.ui.list.contains(open)) void this.goTo(open.dataset.readerBookmarkOpen ?? '');
  };
  private readonly handleListKeydown = (event: KeyboardEvent) => {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches('[data-reader-bookmark-open]')) return;
    const buttons = this.openButtons();
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    let target: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') target = buttons[index + 1] ?? buttons[0];
    if (event.key === 'ArrowUp') target = buttons[index - 1] ?? buttons.at(-1);
    if (event.key === 'Home') target = buttons[0];
    if (event.key === 'End') target = buttons.at(-1);
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.state.open) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  };
  private readonly handleShellToggle = () => {
    if (this.state.open) this.close(false);
  };

  private assertUsable(): void {
    if (this.destroyed) throw new Error('ReaderBookmarksController has been destroyed.');
  }
}
