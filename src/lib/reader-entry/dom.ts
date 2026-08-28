import { getHostedReadingContinuity, subscribeUnifiedReadingState } from './client';
import {
  formatReadingFormat,
  isReadingInProgress,
  readingActionLabel,
  readingFurthestLabel,
  readingPositionLabel,
  type ReadingContinuitySnapshot,
  type ReadingEntryState,
} from './continuity';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

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

function requestForCatalog(card: HTMLElement) {
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
  return { workId, edition, releaseVersion, ...(epubHref ? { epubHref } : {}), ...(webHref ? { webHref } : {}), ...(pdfHref ? { pdfHref } : {}) };
}

function requestForDetail(root: HTMLElement) {
  const workId = root.dataset.workId;
  const edition = Number(root.dataset.edition ?? '');
  const releaseVersion = root.dataset.releaseVersion ?? '';
  if (!workId || !Number.isFinite(edition)) return undefined;
  const readerLink = root.querySelector<HTMLAnchorElement>('[data-format="web"] a');
  const epubAvailable = root.querySelector<HTMLElement>('[data-format="epub"]')?.dataset.formatState === 'available';
  const epubHref = epubAvailable ? readerLink?.href : undefined;
  const webHref = readerLink?.href && !epubHref ? readerLink.href : undefined;
  const pdfHref = root.querySelector<HTMLAnchorElement>('[data-format="pdf"] a')?.href;
  return { workId, edition, releaseVersion, ...(epubHref ? { epubHref } : {}), ...(webHref ? { webHref } : {}), ...(pdfHref ? { pdfHref } : {}) };
}

function preferredProgress(snapshot: ReadingContinuitySnapshot): ReadingEntryState | undefined {
  return snapshot.primary?.current ? snapshot.primary : snapshot.entries.find((entry) => entry.current > 0);
}

function renderTrack(panel: HTMLElement, entry: ReadingEntryState, selectors: {
  context: string;
  label: string;
  fill: string;
  furthest: string;
  detail?: string;
}) {
  const current = clamp01(entry.current);
  const furthest = Math.max(current, clamp01(entry.furthest));
  panel.hidden = false;
  const context = panel.querySelector<HTMLElement>(selectors.context);
  const label = panel.querySelector<HTMLElement>(selectors.label);
  const fill = panel.querySelector<HTMLElement>(selectors.fill);
  const marker = panel.querySelector<HTMLElement>(selectors.furthest);
  if (context) context.textContent = `Reading progress · ${formatReadingFormat(entry.format)}`;
  if (label) label.textContent = `${Math.round(current * 100)}%`;
  if (fill) fill.style.width = `${current * 100}%`;
  if (marker) marker.style.left = `${furthest * 100}%`;
  if (selectors.detail) {
    const detail = panel.querySelector<HTMLElement>(selectors.detail);
    if (detail) detail.textContent = `${readingPositionLabel(entry)} · ${readingFurthestLabel(entry)}`;
  }
}

function entryFor(snapshot: ReadingContinuitySnapshot, format: ReadingEntryState['format']) {
  return snapshot.entries.find((entry) => entry.format === format);
}

async function renderCatalogCard(card: HTMLElement): Promise<ReadingContinuitySnapshot | undefined> {
  const request = requestForCatalog(card);
  if (!request) return undefined;
  const snapshot = await getHostedReadingContinuity(request);
  const primary = snapshot.primary;
  const cta = card.querySelector<HTMLAnchorElement>('.catalog-primary');
  if (cta && primary) {
    cta.href = primary.href;
    cta.textContent = readingActionLabel(primary);
    cta.dataset.readerFormat = primary.format;
    cta.setAttribute('aria-label', `${readingActionLabel(primary)} in ${formatReadingFormat(primary.format)}`);
  }
  const panel = card.querySelector<HTMLElement>('[data-catalog-progress]');
  if (panel) {
    panel.hidden = true;
    const progress = preferredProgress(snapshot);
    if (progress) renderTrack(panel, progress, {
      context: '[data-catalog-progress-context]',
      label: '[data-catalog-progress-label]',
      fill: '[data-catalog-progress-fill]',
      furthest: '[data-catalog-progress-furthest]',
    });
  }
  return snapshot;
}

async function renderCatalog() {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-catalog-work]')];
  const snapshots = new Map<string, ReadingContinuitySnapshot>();
  await Promise.all(cards.map(async (card) => {
    const snapshot = await renderCatalogCard(card);
    if (snapshot && card.dataset.catalogWork) snapshots.set(card.dataset.catalogWork, snapshot);
  }));

  let visible = 0;
  for (const node of document.querySelectorAll<HTMLAnchorElement>('[data-continue-work]')) {
    const workId = node.dataset.continueWork;
    const snapshot = workId ? snapshots.get(workId) : undefined;
    const entry = snapshot?.primary;
    if (!entry || !isReadingInProgress(entry)) {
      node.hidden = true;
      continue;
    }
    node.hidden = false;
    node.href = entry.href;
    visible++;
    const context = node.querySelector<HTMLElement>('[data-continue-context]');
    const progress = node.querySelector<HTMLElement>('[data-continue-progress]');
    if (context) context.textContent = `Continue ${formatReadingFormat(entry.format)}`;
    if (progress) progress.textContent = `${readingPositionLabel(entry)} · Resume`;
  }
  const section = document.querySelector<HTMLElement>('[data-continue-section]');
  if (section) section.hidden = visible === 0;
}

async function renderDetail() {
  const root = document.querySelector<HTMLElement>('[data-work-detail]');
  if (!root) return;
  const request = requestForDetail(root);
  if (!request) return;
  const snapshot = await getHostedReadingContinuity(request);
  const primary = snapshot.primary;
  const cta = root.querySelector<HTMLAnchorElement>('.book-detail__primary');
  if (cta && primary) {
    cta.href = primary.href;
    cta.textContent = readingActionLabel(primary);
    cta.dataset.readerFormat = primary.format;
    cta.setAttribute('aria-label', `${readingActionLabel(primary)} in ${formatReadingFormat(primary.format)}`);
  }

  const progressPanel = root.querySelector<HTMLElement>('[data-publication-progress]');
  if (progressPanel) {
    progressPanel.hidden = true;
    const progress = preferredProgress(snapshot);
    if (progress) renderTrack(progressPanel, progress, {
      context: '[data-progress-context]',
      label: '[data-progress-label]',
      fill: '[data-progress-fill]',
      furthest: '[data-progress-furthest]',
      detail: '[data-progress-detail]',
    });
  }

  const epub = entryFor(snapshot, 'epub') ?? entryFor(snapshot, 'web');
  const pdf = entryFor(snapshot, 'pdf');
  const webCard = root.querySelector<HTMLElement>('[data-format="web"]');
  const webLink = webCard?.querySelector<HTMLAnchorElement>('a');
  if (webLink && epub) {
    webLink.textContent = epub.current > 0 && epub.current < .995
      ? `Continue ${formatReadingFormat(epub.format)} · ${Math.round(epub.current * 100)}%`
      : epub.current >= .995 ? `Read ${formatReadingFormat(epub.format)} again` : `Open ${formatReadingFormat(epub.format)} reader`;
  }
  const pdfCard = root.querySelector<HTMLElement>('[data-format="pdf"]');
  const pdfLink = pdfCard?.querySelector<HTMLAnchorElement>('a');
  if (pdfLink && pdf) {
    const suffix = pdf.page && pdf.pageCount ? ` · page ${pdf.page}/${pdf.pageCount}` : '';
    pdfLink.textContent = pdf.current > 0 && pdf.current < .995
      ? `Continue PDF${suffix}`
      : pdf.current >= .995 ? 'Read PDF again' : 'Open PDF reader';
  }

  const started = snapshot.entries.filter((entry) => entry.current > 0);
  if (started.length > 1 && progressPanel) {
    const detail = progressPanel.querySelector<HTMLElement>('[data-progress-detail]');
    if (detail && primary) {
      const others = started.filter((entry) => entry.format !== primary.format).map(readingPositionLabel);
      if (others.length) detail.textContent = `${readingPositionLabel(primary)} · Also saved: ${others.join(' · ')}`;
    }
  }
}

async function renderAll() {
  await Promise.all([renderCatalog(), renderDetail()]);
}

export function mountUnifiedReaderEntry(): () => void {
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
  const unsubscribe = subscribeUnifiedReadingState(refresh);
  refresh();
  return () => {
    disposed = true;
    unsubscribe();
  };
}
