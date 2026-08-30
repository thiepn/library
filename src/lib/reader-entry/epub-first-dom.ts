const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function hostedSlugFromHref(href?: string): string | undefined {
  if (!href) return undefined;
  try {
    const pathname = new URL(href, window.location.href).pathname;
    const match = pathname.match(/\/works\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function hostedReaderHref(slug: string): string {
  return `${base}/works/${encodeURIComponent(slug)}/read`;
}

function catalogHasEpub(card: HTMLElement): boolean {
  return [...card.querySelectorAll<HTMLElement>('.catalog-format-list span')]
    .some((item) => item.textContent?.trim().toUpperCase() === 'EPUB');
}

function normalizeCatalogEntries(): void {
  const continueItems = [...document.querySelectorAll<HTMLAnchorElement>('[data-continue-work]')];

  document.querySelectorAll<HTMLElement>('[data-catalog-work]').forEach((card) => {
    if (!catalogHasEpub(card)) return;
    const slug = hostedSlugFromHref(card.querySelector<HTMLAnchorElement>('.catalog-cover')?.href);
    if (!slug) return;

    const href = hostedReaderHref(slug);
    card.dataset.webReadable = 'true';

    const primary = card.querySelector<HTMLAnchorElement>('.catalog-primary');
    if (primary) {
      primary.href = href;
      primary.textContent = 'Start reading';
      primary.dataset.catalogReaderCta = '';
    }

    const workId = card.dataset.catalogWork;
    const continueItem = workId
      ? continueItems.find((item) => item.dataset.continueWork === workId)
      : undefined;
    if (continueItem) {
      continueItem.href = href;
      continueItem.dataset.webReadable = 'true';
    }
  });
}

function normalizeDetailEntry(): void {
  const detail = document.querySelector<HTMLElement>('[data-work-detail]');
  if (!detail) return;

  const epubCard = detail.querySelector<HTMLElement>('[data-format="epub"]');
  if (epubCard?.dataset.formatState !== 'available') return;
  const slug = detail.dataset.workSlug;
  if (!slug) return;

  const href = hostedReaderHref(slug);
  const primary = detail.querySelector<HTMLAnchorElement>('.book-detail__primary');
  if (primary) {
    primary.href = href;
    primary.dataset.readerCta = '';
    if (/download epub|read pdf/i.test(primary.textContent ?? '')) primary.textContent = 'Start reading';
  }

  const readerCard = detail.querySelector<HTMLElement>('[data-format="web"]');
  if (!readerCard) return;
  readerCard.dataset.formatState = 'available';
  const state = readerCard.querySelector<HTMLElement>('.book-detail__format-heading span');
  if (state) state.textContent = 'Available';

  let link = readerCard.querySelector<HTMLAnchorElement>('a[data-reader-format-link]');
  if (!link) {
    link = document.createElement('a');
    link.dataset.readerFormatLink = '';
    link.textContent = 'Open reader';
    const unavailable = readerCard.querySelector<HTMLElement>('.book-detail__format-muted');
    if (unavailable) unavailable.replaceWith(link);
    else readerCard.append(link);
  }
  link.href = href;
}

function normalizeSavedEntries(): void {
  document.querySelectorAll<HTMLElement>('[data-saved-work][data-has-epub="true"]').forEach((node) => {
    if (node.dataset.readerHref) return;
    const slug = hostedSlugFromHref(node.querySelector<HTMLAnchorElement>('.publication-cover-link')?.href);
    if (slug) node.dataset.readerHref = hostedReaderHref(slug);
  });
}

/**
 * Normalizes ordinary Library entry surfaces before continuity is mounted.
 * Hosted EPUB availability is enough to expose the native Library reader even
 * when a legacy materialized-web edition is absent. PDF remains an explicit
 * alternate format and keeps independent progress.
 */
export function normalizeEpubFirstReaderEntries(): void {
  normalizeCatalogEntries();
  normalizeDetailEntry();
  normalizeSavedEntries();
}
