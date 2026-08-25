import '../../styles/reader-toc.css';
import { ReaderController, type ReaderControllerState } from './controller';
import type { ReaderTocItem, Unsubscribe } from './types';

export interface ReaderTocState {
  open: boolean;
  activeHref: string | null;
  activeLabel: string | null;
  itemCount: number;
}

interface RenderedTocEntry {
  key: string;
  href: string;
  label: string;
  normalizedHref: string;
  normalizedDocument: string;
  button: HTMLButtonElement;
  item: HTMLLIElement;
  parentKeys: string[];
}

interface TocElements {
  panel: HTMLElement;
  backdrop: HTMLButtonElement;
  list: HTMLOListElement;
  empty: HTMLElement;
  status: HTMLElement;
  close: HTMLButtonElement;
  contentsButton: HTMLButtonElement;
}

function normalizeHref(value: string): string {
  return value.trim().replace(/^\.\//, '');
}

function normalizeDocumentHref(value: string): string {
  const normalized = normalizeHref(value);
  return (normalized.split('#', 1)[0] ?? normalized).split('?', 1)[0] ?? normalized;
}

function tocSignature(items: ReaderTocItem[]): string {
  return JSON.stringify(items.map((item) => [item.id, item.href, item.label, tocSignature(item.children)]));
}

function createButton(className: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function ensureTocElements(root: HTMLElement): TocElements {
  const contentsButton = root.querySelector<HTMLButtonElement>('[data-reader-command="contents"]');
  if (!contentsButton) throw new Error('Reader shell is missing the Contents control.');

  let panel = root.querySelector<HTMLElement>('[data-reader-toc-panel]');
  let backdrop = root.querySelector<HTMLButtonElement>('[data-reader-toc-backdrop]');

  if (!panel || !backdrop) {
    backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'reader-toc__backdrop';
    backdrop.dataset.readerTocBackdrop = '';
    backdrop.setAttribute('aria-label', 'Close contents');
    backdrop.hidden = true;

    panel = document.createElement('aside');
    panel.id = 'reader-contents';
    panel.className = 'reader-toc';
    panel.dataset.readerTocPanel = '';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'reader-contents-title');
    panel.hidden = true;

    const header = document.createElement('header');
    header.className = 'reader-toc__header';
    const headingGroup = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'reader-toc__eyebrow';
    eyebrow.textContent = 'Book';
    const heading = document.createElement('h2');
    heading.id = 'reader-contents-title';
    heading.textContent = 'Contents';
    headingGroup.append(eyebrow, heading);
    const close = createButton('reader-toc__close', 'Close');
    close.dataset.readerTocClose = '';
    close.setAttribute('aria-label', 'Close contents');
    header.append(headingGroup, close);

    const nav = document.createElement('nav');
    nav.className = 'reader-toc__nav';
    nav.setAttribute('aria-label', 'Book table of contents');
    const list = document.createElement('ol');
    list.className = 'reader-toc__list reader-toc__list--root';
    list.dataset.readerTocList = '';
    nav.append(list);

    const empty = document.createElement('p');
    empty.className = 'reader-toc__empty';
    empty.dataset.readerTocEmpty = '';
    empty.textContent = 'This publication does not provide a table of contents.';
    empty.hidden = true;

    const status = document.createElement('p');
    status.className = 'reader-toc__status';
    status.dataset.readerTocStatus = '';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');

    panel.append(header, nav, empty, status);
    root.append(backdrop, panel);
  }

  const list = panel.querySelector<HTMLOListElement>('[data-reader-toc-list]');
  const empty = panel.querySelector<HTMLElement>('[data-reader-toc-empty]');
  const status = panel.querySelector<HTMLElement>('[data-reader-toc-status]');
  const close = panel.querySelector<HTMLButtonElement>('[data-reader-toc-close]');
  if (!list || !empty || !status || !close) throw new Error('Reader contents panel is incomplete.');

  contentsButton.setAttribute('aria-controls', panel.id);
  contentsButton.setAttribute('aria-expanded', 'false');

  return { panel, backdrop, list, empty, status, close, contentsButton };
}

export class ReaderTocController {
  private readonly controller: ReaderController;
  private readonly root: HTMLElement;
  private readonly elements: TocElements;
  private readonly listeners = new Set<(state: ReaderTocState) => void>();
  private readonly entries: RenderedTocEntry[] = [];
  private readonly groups = new Map<string, HTMLOListElement>();
  private readonly disclosures = new Map<string, HTMLButtonElement>();
  private unsubscribeController: Unsubscribe | undefined;
  private signature = '';
  private lastReaderStatus: ReaderControllerState['status'] | null = null;
  private state: ReaderTocState = { open: false, activeHref: null, activeLabel: null, itemCount: 0 };
  private started = false;
  private destroyed = false;

  constructor(controller: ReaderController, root: HTMLElement) {
    this.controller = controller;
    this.root = root;
    this.elements = ensureTocElements(root);
    this.elements.panel.addEventListener('click', this.handlePanelClick);
    this.elements.backdrop.addEventListener('click', this.handleBackdropClick);
    document.addEventListener('keydown', this.handleKeydown);
  }

  get snapshot(): ReaderTocState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;
    this.unsubscribeController = this.controller.subscribe((state) => this.syncReaderState(state));
  }

  subscribe(listener: (state: ReaderTocState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  open(): void {
    this.assertUsable();
    if (this.state.open || this.root.dataset.readerStatus !== 'ready' || this.entries.length === 0) return;
    this.elements.status.textContent = '';
    this.elements.panel.hidden = false;
    this.elements.backdrop.hidden = false;
    this.root.dataset.readerToc = 'open';
    this.elements.contentsButton.setAttribute('aria-expanded', 'true');
    this.setState({ ...this.state, open: true });
    this.expandActiveBranch();
    this.elements.close.focus();
    window.requestAnimationFrame(() => this.activeEntry()?.button.scrollIntoView({ block: 'nearest' }));
  }

  close(restoreFocus = true): void {
    if (this.destroyed || !this.state.open) return;
    this.elements.panel.hidden = true;
    this.elements.backdrop.hidden = true;
    this.root.dataset.readerToc = 'closed';
    this.elements.contentsButton.setAttribute('aria-expanded', 'false');
    this.setState({ ...this.state, open: false });
    if (restoreFocus) this.elements.contentsButton.focus();
  }

  toggle(): void {
    if (this.state.open) this.close();
    else this.open();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.close(false);
    this.destroyed = true;
    this.unsubscribeController?.();
    this.unsubscribeController = undefined;
    this.elements.panel.removeEventListener('click', this.handlePanelClick);
    this.elements.backdrop.removeEventListener('click', this.handleBackdropClick);
    document.removeEventListener('keydown', this.handleKeydown);
    this.listeners.clear();
    this.entries.length = 0;
    this.groups.clear();
    this.disclosures.clear();
  }

  private syncReaderState(state: ReaderControllerState): void {
    const becameReady = state.status === 'ready' && this.lastReaderStatus !== 'ready';
    if (state.status !== 'ready') this.close(false);

    if (becameReady) {
      const nextSignature = tocSignature(state.toc);
      if (nextSignature !== this.signature) {
        this.signature = nextSignature;
        this.render(state.toc);
      }
    }

    this.elements.contentsButton.disabled = state.status !== 'ready' || this.entries.length === 0;
    if (state.location) this.activate(state.location.href);
    this.lastReaderStatus = state.status;
  }

  private render(items: ReaderTocItem[]): void {
    this.entries.length = 0;
    this.groups.clear();
    this.disclosures.clear();
    this.elements.list.replaceChildren();

    let keyCounter = 0;
    const renderLevel = (source: ReaderTocItem[], list: HTMLOListElement, parentKeys: string[], depth: number) => {
      for (const item of source) {
        keyCounter += 1;
        const key = `toc-${keyCounter}`;
        const label = item.label.trim() || 'Untitled section';
        const li = document.createElement('li');
        li.className = 'reader-toc__item';
        li.dataset.readerTocItem = key;
        li.dataset.readerTocDepth = String(depth);

        const row = document.createElement('div');
        row.className = 'reader-toc__row';

        if (item.children.length) {
          const disclosure = createButton('reader-toc__disclosure', '');
          disclosure.dataset.readerTocDisclosure = key;
          disclosure.setAttribute('aria-expanded', 'true');
          disclosure.setAttribute('aria-label', `Collapse ${label}`);
          disclosure.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg>';
          row.append(disclosure);
          this.disclosures.set(key, disclosure);
        } else {
          const spacer = document.createElement('span');
          spacer.className = 'reader-toc__disclosure-spacer';
          spacer.setAttribute('aria-hidden', 'true');
          row.append(spacer);
        }

        const target = createButton('reader-toc__target', label);
        target.dataset.readerTocTarget = item.href;
        target.dataset.readerTocKey = key;
        row.append(target);
        li.append(row);

        this.entries.push({
          key,
          href: item.href,
          label,
          normalizedHref: normalizeHref(item.href),
          normalizedDocument: normalizeDocumentHref(item.href),
          button: target,
          item: li,
          parentKeys: [...parentKeys],
        });

        if (item.children.length) {
          const nested = document.createElement('ol');
          nested.className = 'reader-toc__list';
          nested.dataset.readerTocGroup = key;
          nested.id = `reader-toc-group-${key}`;
          this.disclosures.get(key)?.setAttribute('aria-controls', nested.id);
          renderLevel(item.children, nested, [...parentKeys, key], depth + 1);
          li.append(nested);
          this.groups.set(key, nested);
        }

        list.append(li);
      }
    };

    renderLevel(items, this.elements.list, [], 0);
    this.elements.empty.hidden = items.length > 0;
    this.elements.contentsButton.disabled = this.root.dataset.readerStatus !== 'ready' || items.length === 0;
    this.setState({ ...this.state, itemCount: this.entries.length });
  }

  private activate(href: string): void {
    const normalizedHref = normalizeHref(href);
    const normalizedDocument = normalizeDocumentHref(href);
    let active = this.entries.find((entry) => entry.normalizedHref === normalizedHref);
    active ??= this.entries.find((entry) => entry.normalizedDocument === normalizedDocument);

    for (const entry of this.entries) {
      entry.button.removeAttribute('aria-current');
      delete entry.item.dataset.readerTocActive;
      delete entry.item.dataset.readerTocAncestor;
    }

    if (!active) {
      if (this.state.activeHref !== null || this.state.activeLabel !== null) {
        this.setState({ ...this.state, activeHref: null, activeLabel: null });
      }
      return;
    }

    active.button.setAttribute('aria-current', 'location');
    active.item.dataset.readerTocActive = 'true';
    for (const parentKey of active.parentKeys) {
      const parent = this.entries.find((entry) => entry.key === parentKey);
      if (parent) parent.item.dataset.readerTocAncestor = 'true';
    }
    this.expandBranch(active.parentKeys);

    if (this.state.activeHref !== active.href || this.state.activeLabel !== active.label) {
      this.setState({ ...this.state, activeHref: active.href, activeLabel: active.label });
    }
  }

  private activeEntry(): RenderedTocEntry | undefined {
    if (!this.state.activeHref) return undefined;
    return this.entries.find((entry) => entry.href === this.state.activeHref);
  }

  private expandActiveBranch(): void {
    const active = this.activeEntry();
    if (active) this.expandBranch(active.parentKeys);
  }

  private expandBranch(keys: string[]): void {
    for (const key of keys) this.setGroupExpanded(key, true);
  }

  private setGroupExpanded(key: string, expanded: boolean): void {
    const group = this.groups.get(key);
    const disclosure = this.disclosures.get(key);
    if (!group || !disclosure) return;
    group.hidden = !expanded;
    disclosure.setAttribute('aria-expanded', String(expanded));
    const entry = this.entries.find((candidate) => candidate.key === key);
    disclosure.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${entry?.label ?? 'section'}`);
  }

  private readonly handlePanelClick = (event: MouseEvent) => {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin) return;

    const close = origin.closest<HTMLElement>('[data-reader-toc-close]');
    if (close) {
      this.close();
      return;
    }

    const disclosure = origin.closest<HTMLButtonElement>('[data-reader-toc-disclosure]');
    if (disclosure) {
      const key = disclosure.dataset.readerTocDisclosure;
      if (key) this.setGroupExpanded(key, disclosure.getAttribute('aria-expanded') !== 'true');
      return;
    }

    const target = origin.closest<HTMLButtonElement>('[data-reader-toc-target]');
    if (!target) return;
    const href = target.dataset.readerTocTarget;
    if (!href) return;
    target.disabled = true;
    this.elements.status.textContent = '';
    void this.controller.goTo(href)
      .then(() => {
        target.disabled = false;
        this.close();
      })
      .catch(() => {
        target.disabled = false;
        this.elements.status.textContent = 'Unable to open this section.';
      });
  };

  private readonly handleBackdropClick = () => this.close();

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (!this.state.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(this.elements.panel.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  private setState(next: ReaderTocState): void {
    this.state = next;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader TOC controller has been destroyed.');
  }
}
