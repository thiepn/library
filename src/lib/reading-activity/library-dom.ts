import { formatReadingFormat, readingPositionLabel } from '../reader-entry/continuity';
import type { ReadingContinuityRequest } from '../reader-entry/client';
import {
  getReadingLibraryState,
  subscribeReadingLibraryState,
} from './client';
import {
  compareReadingRecency,
  hasReadingActivity,
  readingLibraryStatusLabel,
  readingLibraryStatusRank,
  type ReadingLibraryState,
  type ReadingLibraryStatus,
} from './model';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const validFilters = new Set(['all', 'in-progress', 'not-started', 'completed']);
type LibraryFilter = 'all' | ReadingLibraryStatus;

function slugFromHref(href?: string | null): string | undefined {
  if (!href) return undefined;
  try {
    const parts = new URL(href, location.href).pathname.split('/').filter(Boolean);
    const workIndex = parts.lastIndexOf('works');
    return workIndex >= 0 ? parts[workIndex + 1] : undefined;
  } catch {
    return undefined;
  }
}

function hasFormat(root: ParentNode, label: string): boolean {
  return [...root.querySelectorAll<HTMLElement>('.catalog-format-list span, [data-format]')]
    .some((node) => node.dataset.format === label.toLowerCase() || node.textContent?.trim() === label);
}

function requestForCatalog(card: HTMLElement): ReadingContinuityRequest | undefined {
  const workId = card.dataset.catalogWork;
  const edition = Number(card.dataset.edition ?? '');
  const releaseVersion = card.dataset.releaseVersion ?? '';
  const detailHref = card.querySelector<HTMLAnchorElement>('.catalog-cover')?.href
    ?? card.querySelector<HTMLAnchorElement>('a[href*="/works/"]')?.href;
  const slug = slugFromHref(detailHref);
  if (!workId || !slug || !Number.isFinite(edition)) return undefined;
  const readerHref = card.dataset.webReadable === 'true' ? `${base}/works/${slug}/read` : undefined;
  const epubHref = hasFormat(card, 'EPUB') ? readerHref : undefined;
  const webHref = readerHref && !epubHref ? readerHref : undefined;
  const pdfHref = hasFormat(card, 'PDF') ? `${base}/works/${slug}/pdf` : undefined;
  return {
    workId,
    edition,
    releaseVersion,
    ...(epubHref ? { epubHref } : {}),
    ...(webHref ? { webHref } : {}),
    ...(pdfHref ? { pdfHref } : {}),
  };
}

function requestForDetail(root: HTMLElement): ReadingContinuityRequest | undefined {
  const workId = root.dataset.workId;
  const edition = Number(root.dataset.edition ?? '');
  const releaseVersion = root.dataset.releaseVersion ?? '';
  if (!workId || !Number.isFinite(edition)) return undefined;
  const readerLink = root.querySelector<HTMLAnchorElement>('[data-format="web"] a');
  const epubAvailable = root.querySelector<HTMLElement>('[data-format="epub"]')?.dataset.formatState === 'available';
  const epubHref = epubAvailable ? readerLink?.href : undefined;
  const webHref = readerLink?.href && !epubHref ? readerLink.href : undefined;
  const pdfHref = root.querySelector<HTMLAnchorElement>('[data-format="pdf"] a')?.href;
  return {
    workId,
    edition,
    releaseVersion,
    ...(epubHref ? { epubHref } : {}),
    ...(webHref ? { webHref } : {}),
    ...(pdfHref ? { pdfHref } : {}),
  };
}

function requestForSavedHosted(node: HTMLElement): ReadingContinuityRequest | undefined {
  const workId = node.dataset.savedWork;
  const edition = Number(node.dataset.edition ?? '');
  const releaseVersion = node.dataset.releaseVersion ?? '';
  if (!workId || !Number.isFinite(edition)) return undefined;
  const readerHref = node.dataset.readerHref || undefined;
  const epubHref = node.dataset.hasEpub === 'true' ? readerHref : undefined;
  const webHref = readerHref && !epubHref ? readerHref : undefined;
  const pdfHref = node.dataset.pdfHref || undefined;
  return {
    workId,
    edition,
    releaseVersion,
    ...(epubHref ? { epubHref } : {}),
    ...(webHref ? { webHref } : {}),
    ...(pdfHref ? { pdfHref } : {}),
  };
}

function formatActivityDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function activitySummary(state: ReadingLibraryState): string {
  const status = readingLibraryStatusLabel(state.status);
  if (!state.lastActivityAt || !state.lastFormat) return status;
  const date = formatActivityDate(state.lastActivityAt);
  return `${status} · Last read ${formatReadingFormat(state.lastFormat)}${date ? ` · ${date}` : ''}`;
}

function decorateState(node: HTMLElement, state: ReadingLibraryState) {
  node.dataset.readingStatus = state.status;
  if (state.lastActivityAt) node.dataset.lastActivityAt = state.lastActivityAt;
  else delete node.dataset.lastActivityAt;
  if (state.lastFormat) node.dataset.lastReadFormat = state.lastFormat;
  else delete node.dataset.lastReadFormat;
}

async function renderCatalogActivity(): Promise<Map<string, ReadingLibraryState>> {
  const states = new Map<string, ReadingLibraryState>();
  await Promise.all([...document.querySelectorAll<HTMLElement>('[data-catalog-work]')].map(async (card) => {
    const request = requestForCatalog(card);
    if (!request) return;
    const state = await getReadingLibraryState(request);
    states.set(request.workId, state);
    decorateState(card, state);
    const label = card.querySelector<HTMLElement>('[data-catalog-activity]');
    if (label) {
      label.hidden = !hasReadingActivity(state);
      if (!label.hidden) label.textContent = activitySummary(state);
    }
  }));
  return states;
}

function reorderContinueByRecency(states: Map<string, ReadingLibraryState>) {
  const list = document.querySelector<HTMLElement>('[data-continue-list]');
  if (!list) return;
  const nodes = [...list.querySelectorAll<HTMLAnchorElement>('[data-continue-work]')];
  nodes.sort((a, b) => {
    const aState = a.dataset.continueWork ? states.get(a.dataset.continueWork) : undefined;
    const bState = b.dataset.continueWork ? states.get(b.dataset.continueWork) : undefined;
    if (!aState || !bState) return 0;
    return compareReadingRecency(aState, bState);
  });
  list.append(...nodes);
}

function renderRecent(states: Map<string, ReadingLibraryState>) {
  const section = document.querySelector<HTMLElement>('[data-recent-section]');
  const list = document.querySelector<HTMLElement>('[data-recent-list]');
  if (!section || !list) return;

  const ranked = [...list.querySelectorAll<HTMLAnchorElement>('[data-recent-work]')]
    .map((node) => ({ node, state: node.dataset.recentWork ? states.get(node.dataset.recentWork) : undefined }))
    .filter((item): item is { node: HTMLAnchorElement; state: ReadingLibraryState } => Boolean(item.state && hasReadingActivity(item.state)))
    .sort((a, b) => compareReadingRecency(a.state, b.state));

  const visible = new Set(ranked.slice(0, 5).map((item) => item.node));
  for (const node of list.querySelectorAll<HTMLAnchorElement>('[data-recent-work]')) node.hidden = !visible.has(node);

  for (const { node, state } of ranked) {
    list.append(node);
    const primary = state.continuity.primary;
    if (primary) node.href = primary.href;
    const context = node.querySelector<HTMLElement>('[data-recent-context]');
    const detail = node.querySelector<HTMLElement>('[data-recent-detail]');
    if (context) context.textContent = state.lastFormat
      ? `${readingLibraryStatusLabel(state.status)} · ${formatReadingFormat(state.lastFormat)}`
      : readingLibraryStatusLabel(state.status);
    if (detail) {
      const date = formatActivityDate(state.lastActivityAt);
      detail.textContent = primary?.current
        ? `${readingPositionLabel(primary)}${date ? ` · ${date}` : ''}`
        : date ? `Opened ${date}` : 'Recently opened';
    }
  }

  section.hidden = visible.size === 0;
}

async function renderBookDetailActivity() {
  const root = document.querySelector<HTMLElement>('[data-work-detail]');
  if (!root) return;
  const request = requestForDetail(root);
  if (!request) return;
  const state = await getReadingLibraryState(request);
  decorateState(root, state);
  const label = root.querySelector<HTMLElement>('[data-reading-activity]');
  if (label) {
    label.hidden = !hasReadingActivity(state);
    if (!label.hidden) label.textContent = activitySummary(state);
  }
}

function ensureItemStateLabel(node: HTMLElement, anchorSelector: string): HTMLElement {
  let label = node.querySelector<HTMLElement>('[data-library-item-state]');
  if (label) return label;
  label = document.createElement('p');
  label.className = 'library-item-state micro';
  label.dataset.libraryItemState = '';
  const anchor = node.querySelector<HTMLElement>(anchorSelector);
  if (anchor?.parentElement) anchor.parentElement.insertBefore(label, anchor);
  else node.append(label);
  return label;
}

async function decorateSavedHosted(): Promise<Array<{ node: HTMLElement; state: ReadingLibraryState }>> {
  const values = await Promise.all([...document.querySelectorAll<HTMLElement>('[data-saved-work]')].map(async (node) => {
    const request = requestForSavedHosted(node);
    if (!request) return undefined;
    const state = await getReadingLibraryState(request);
    decorateState(node, state);
    const label = ensureItemStateLabel(node, '.work-card');
    label.textContent = activitySummary(state);
    return { node, state };
  }));
  return values.filter((value): value is { node: HTMLElement; state: ReadingLibraryState } => Boolean(value));
}

async function decoratePersonalBooks(): Promise<Array<{ node: HTMLElement; state: ReadingLibraryState }>> {
  const nodes = [...document.querySelectorAll<HTMLElement>('[data-personal-book]')];
  if (!nodes.length) return [];
  const {
    getPersonalBook,
    personalReaderReleaseVersion,
    personalReaderWorkId,
  } = await import('../client/personal-books');

  const values = await Promise.all(nodes.map(async (node) => {
    const id = node.dataset.personalBook;
    if (!id) return undefined;
    const book = await getPersonalBook(id).catch(() => undefined);
    if (!book) return undefined;
    const workId = personalReaderWorkId(book);
    const releaseVersion = personalReaderReleaseVersion(book);
    const href = book.format === 'epub'
      ? `${base}/personal/read?id=${encodeURIComponent(book.id)}`
      : `${base}/personal/pdf?id=${encodeURIComponent(book.id)}`;
    const request: ReadingContinuityRequest = {
      workId,
      edition: 1,
      releaseVersion,
      ...(book.format === 'epub' ? { epubHref: href } : { pdfHref: href }),
    };
    const state = await getReadingLibraryState(request);
    decorateState(node, state);
    const label = ensureItemStateLabel(node, '.personal-book__actions');
    label.textContent = activitySummary(state);
    return { node, state };
  }));
  return values.filter((value): value is { node: HTMLElement; state: ReadingLibraryState } => Boolean(value));
}

function currentFilter(): LibraryFilter {
  const active = document.querySelector<HTMLButtonElement>('[data-reading-filter][aria-pressed="true"]')?.dataset.readingFilter;
  return active && validFilters.has(active) ? active as LibraryFilter : 'all';
}

function applyLibraryFilter(items: Array<{ node: HTMLElement; state: ReadingLibraryState }>) {
  const filter = currentFilter();
  for (const { node, state } of items) {
    node.dataset.activityFilterHidden = String(filter !== 'all' && state.status !== filter);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-reading-filter]')) {
    button.setAttribute('aria-pressed', String(button.dataset.readingFilter === filter));
  }
}

function sortLibraryItems(items: Array<{ node: HTMLElement; state: ReadingLibraryState }>) {
  const compare = (a: { state: ReadingLibraryState }, b: { state: ReadingLibraryState }) => {
    const rank = readingLibraryStatusRank(a.state.status) - readingLibraryStatusRank(b.state.status);
    return rank || compareReadingRecency(a.state, b.state);
  };
  const hosted = items.filter(({ node }) => node.matches('[data-saved-work]')).sort(compare);
  const personal = items.filter(({ node }) => node.matches('[data-personal-book]')).sort(compare);
  const hostedList = document.querySelector<HTMLElement>('[data-saved-list]');
  const personalList = document.querySelector<HTMLElement>('[data-personal-books-list]');
  if (hostedList) {
    const desired = hosted.map(({ node }) => node);
    const current = [...hostedList.querySelectorAll<HTMLElement>('[data-saved-work]')];
    if (desired.some((node, index) => current[index] !== node)) hostedList.append(...desired);
  }
  if (personalList) {
    const desired = personal.map(({ node }) => node);
    const current = [...personalList.querySelectorAll<HTMLElement>('[data-personal-book]')];
    if (desired.some((node, index) => current[index] !== node)) personalList.append(...desired);
  }
}

function renderLibrarySummary(items: Array<{ node: HTMLElement; state: ReadingLibraryState }>) {
  const summary = document.querySelector<HTMLElement>('[data-reading-state-summary]');
  if (!summary) return;
  const members = items.filter(({ node }) => !node.hidden);
  const reading = members.filter(({ state }) => state.status === 'in-progress').length;
  const finished = members.filter(({ state }) => state.status === 'completed').length;
  const later = members.filter(({ state }) => state.status === 'not-started').length;
  summary.textContent = `${reading} reading · ${finished} finished · ${later} saved for later`;
}

async function renderMyLibrary() {
  if (!document.querySelector('[data-reading-filter]')) return;
  const [hosted, personal] = await Promise.all([decorateSavedHosted(), decoratePersonalBooks()]);
  const items = [...hosted, ...personal];
  sortLibraryItems(items);
  applyLibraryFilter(items);
  renderLibrarySummary(items);
}

async function renderAll() {
  const states = await renderCatalogActivity();
  reorderContinueByRecency(states);
  renderRecent(states);
  await Promise.all([renderBookDetailActivity(), renderMyLibrary()]);
}

export function mountReadingActivityLibraryState(): () => void {
  let disposed = false;
  let scheduled = false;
  const refresh = () => {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!disposed) void renderAll();
    });
  };

  const unsubscribe = subscribeReadingLibraryState(refresh);
  const personalList = document.querySelector<HTMLElement>('[data-personal-books-list]');
  const observer = personalList ? new MutationObserver(refresh) : undefined;
  if (personalList) observer?.observe(personalList, { childList: true });

  const filterRoot = document.querySelector<HTMLElement>('[data-reading-filters]');
  const filterListener = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-reading-filter]') : null;
    if (!target || !filterRoot?.contains(target)) return;
    for (const button of filterRoot.querySelectorAll<HTMLButtonElement>('[data-reading-filter]')) {
      button.setAttribute('aria-pressed', String(button === target));
    }
    refresh();
  };
  filterRoot?.addEventListener('click', filterListener);

  refresh();
  return () => {
    disposed = true;
    unsubscribe();
    observer?.disconnect();
    filterRoot?.removeEventListener('click', filterListener);
  };
}
