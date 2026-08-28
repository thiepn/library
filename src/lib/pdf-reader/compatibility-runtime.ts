import { inspectPublication } from '../publication-compatibility';
import type { PdfCanonicalCandidate } from './canonical';
import {
  mountPdfReader as mountPdfReaderRuntime,
  type PdfReaderHandle,
} from './runtime';

function numberText(root: HTMLElement, selector: string): number | undefined {
  const value = Number(root.querySelector<HTMLElement>(selector)?.textContent?.trim());
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function installTextCapability(root: HTMLElement): () => void {
  const textLayer = root.querySelector<HTMLElement>('[data-pdf-text-layer]');
  const pageInput = root.querySelector<HTMLInputElement>('[data-pdf-page-input]');
  const searchToggle = root.querySelector<HTMLButtonElement>('[data-pdf-search-toggle]');
  const searchStatus = root.querySelector<HTMLElement>('[data-pdf-search-status]');
  if (!textLayer || !pageInput || !searchToggle || !searchStatus) return () => {};

  const observed = new Map<number, boolean>();
  let scheduled = false;
  const update = () => {
    scheduled = false;
    if (root.dataset.pdfReaderState !== 'ready') return;
    const page = Number(pageInput.value);
    const pageCount = numberText(root, '[data-pdf-page-count]');
    const hasText = Boolean(textLayer.textContent?.replace(/\s+/g, ' ').trim());
    if (Number.isFinite(page) && page > 0) observed.set(page, hasText);
    root.dataset.pdfPageText = hasText ? 'available' : 'unavailable';
    textLayer.setAttribute('aria-label', hasText ? 'Selectable PDF text' : 'This page has no selectable text');

    const allObserved = Boolean(pageCount && observed.size >= pageCount);
    const anyText = [...observed.values()].some(Boolean);
    if (allObserved && !anyText) root.dataset.pdfDocumentText = 'unavailable';
    else if (anyText) root.dataset.pdfDocumentText = 'available';
    else root.dataset.pdfDocumentText = 'unknown';

    if (root.dataset.pdfDocumentText === 'unavailable') {
      searchToggle.setAttribute('aria-description', 'This PDF has no searchable text. It may be scanned or image-only.');
      if (/^(?:Enter text|0 matching pages?)/i.test(searchStatus.textContent?.trim() ?? '')) {
        searchStatus.textContent = 'This PDF has no searchable text. It may be scanned or image-only.';
      }
    } else {
      searchToggle.removeAttribute('aria-description');
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(textLayer, { childList: true, subtree: true, characterData: true });
  observer.observe(searchStatus, { childList: true, subtree: true, characterData: true });
  pageInput.addEventListener('change', schedule);
  searchToggle.addEventListener('click', schedule);
  schedule();

  return () => {
    observer.disconnect();
    pageInput.removeEventListener('change', schedule);
    searchToggle.removeEventListener('click', schedule);
  };
}

/**
 * RR3 wrapper for the canonical PDF runtime. Local ArrayBuffer sources receive bounded
 * compatibility inspection before PDF.js, while runtime text-layer observation exposes honest
 * selection/search capability for scanned or image-only documents.
 */
export async function mountCompatiblePdfReader(
  root: HTMLElement,
  candidate: PdfCanonicalCandidate,
): Promise<PdfReaderHandle> {
  if (candidate.source instanceof ArrayBuffer) {
    const compatibility = await inspectPublication(candidate.source, 'pdf');
    root.dataset.pdfCompatibility = compatibility.disposition;
    root.dataset.pdfProfile = compatibility.profile;
    root.dataset.pdfFeatures = compatibility.features.join(' ');
  }

  const runtime = await mountPdfReaderRuntime(root, candidate);
  const uninstallTextCapability = installTextCapability(root);
  return {
    retry: () => runtime.retry(),
    async destroy() {
      uninstallTextCapability();
      await runtime.destroy();
    },
  };
}
