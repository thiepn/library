import ePub, {
  type Book,
  type Contents,
  type Location as EpubLocation,
  type NavItem,
  type Rendition,
} from 'epubjs';
import type { ReaderEngine } from './engine';
import {
  ReaderEngineError,
  type ReaderAppearance,
  type ReaderContentInteraction,
  type ReaderEngineMetadata,
  type ReaderFlow,
  type ReaderFontFamily,
  type ReaderInteractionHandler,
  type ReaderLocation,
  type ReaderLocationMap,
  type ReaderOpenOptions,
  type ReaderPointerType,
  type ReaderSelection,
  type ReaderSpread,
  type ReaderTocItem,
  type Unsubscribe,
} from '../types';

const DEFAULT_APPEARANCE: ReaderAppearance = {
  fontFamily: 'publisher',
  fontScale: 1,
  lineHeight: 1.55,
  paragraphSpacing: 0,
  alignment: 'left',
  theme: 'light',
};

const FONT_STACKS: Record<Exclude<ReaderFontFamily, 'publisher'>, string> = {
  literata: '"Literata", Georgia, "Times New Roman", serif',
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  accessible: 'Verdana, "Segoe UI", Arial, sans-serif',
};

interface ThemePalette {
  background: string;
  text: string;
  secondary: string;
  link: string;
  rule: string;
  surface: string;
  code: string;
  mark: string;
}

interface PointerStart {
  x: number;
  y: number;
  time: number;
  pointerType: ReaderPointerType;
  interactive: boolean;
}

interface RenderedView {
  contents?: Contents;
}

const THEME_PALETTES: Record<ReaderAppearance['theme'], ThemePalette> = {
  light: { background: '#fbfbfa', text: '#1d1e1c', secondary: '#555a55', link: '#315f86', rule: '#d7d9d5', surface: '#f1f2ef', code: '#f0f1ee', mark: '#fff1a8' },
  warm: { background: '#f7f3e8', text: '#28251f', secondary: '#625b50', link: '#6f552f', rule: '#d7cebd', surface: '#eee7d8', code: '#eee6d5', mark: '#eadc91' },
  sepia: { background: '#efe3ca', text: '#30271f', secondary: '#665545', link: '#75522f', rule: '#cdbb9d', surface: '#e6d5b6', code: '#e5d4b5', mark: '#ddc77f' },
  gray: { background: '#e7e8e8', text: '#26282a', secondary: '#5d6265', link: '#3d5f72', rule: '#c7cbcd', surface: '#daddde', code: '#d8dcdd', mark: '#d8cf83' },
  dark: { background: '#1c1d1e', text: '#e8e7e3', secondary: '#b9b8b2', link: '#9bc8e6', rule: '#454748', surface: '#292b2c', code: '#27292a', mark: '#655d2d' },
  black: { background: '#000000', text: '#efefed', secondary: '#b9b9b5', link: '#abd5ef', rule: '#353535', surface: '#111111', code: '#151515', mark: '#5f5728' },
};

function themeRules(palette: ThemePalette): Record<string, Record<string, string>> {
  return {
    'html, body': {
      color: palette.text,
      background: palette.background,
      'background-color': palette.background,
    },
    body: { color: palette.text, background: palette.background },
    'h1, h2, h3, h4, h5, h6, p, li, dt, dd, figcaption': { color: 'inherit' },
    a: { color: palette.link },
    'blockquote, aside': {
      color: palette.secondary,
      'border-color': palette.rule,
    },
    'hr, table, th, td': { 'border-color': palette.rule },
    th: { background: palette.surface, color: palette.text },
    'pre, code, kbd, samp': { background: palette.code, color: palette.text },
    mark: { background: palette.mark, color: palette.text },
    'img, svg, video': { 'color-scheme': 'normal' },
  };
}

const THEME_RULES: Record<ReaderAppearance['theme'], Record<string, Record<string, string>>> = {
  light: themeRules(THEME_PALETTES.light),
  warm: themeRules(THEME_PALETTES.warm),
  sepia: themeRules(THEME_PALETTES.sepia),
  gray: themeRules(THEME_PALETTES.gray),
  dark: themeRules(THEME_PALETTES.dark),
  black: themeRules(THEME_PALETTES.black),
};

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  'details',
  'audio',
  'video',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[data-no-reader-nav]',
].join(',');

function mapFlow(flow: ReaderFlow): string {
  return flow === 'scrolled' ? 'scrolled-doc' : 'paginated';
}

function mapSpread(spread: ReaderSpread): string {
  if (spread === 'single') return 'none';
  if (spread === 'double') return 'always';
  return 'auto';
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizePointerType(value: string): ReaderPointerType {
  if (value === 'mouse' || value === 'touch' || value === 'pen') return value;
  return 'unknown';
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  if (typeof candidate?.closest !== 'function') return false;
  try {
    return Boolean(candidate.closest(INTERACTIVE_SELECTOR));
  } catch {
    return false;
  }
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mapLocation(location: EpubLocation): ReaderLocation {
  const start = location.start;
  const locationNumber = finite(start.location);
  const percentage = finite(start.percentage);
  const displayedPage = finite(start.displayed?.page);
  const displayedTotal = finite(start.displayed?.total);
  return {
    cfi: String(start.cfi),
    href: String(start.href ?? ''),
    index: Number(start.index ?? 0),
    ...(locationNumber !== undefined ? { location: locationNumber } : {}),
    ...(percentage !== undefined ? { percentage } : {}),
    ...(displayedPage !== undefined ? { displayedPage } : {}),
    ...(displayedTotal !== undefined ? { displayedTotal } : {}),
    atStart: Boolean(location.atStart),
    atEnd: Boolean(location.atEnd),
  };
}

function mapToc(items: NavItem[] = []): ReaderTocItem[] {
  return items.map((item) => ({
    id: String(item.id ?? item.href),
    href: String(item.href),
    label: String(item.label ?? '').trim(),
    children: mapToc(item.subitems ?? []),
  }));
}

function normalizeError(code: ReaderEngineError['code'], message: string, cause: unknown): ReaderEngineError {
  return cause instanceof ReaderEngineError ? cause : new ReaderEngineError(code, message, cause);
}

export class EpubJsEngine implements ReaderEngine {
  private book: Book | undefined;
  private rendition: Rendition | undefined;
  private currentLocation: ReaderLocation | null = null;
  private appearance: ReaderAppearance = { ...DEFAULT_APPEARANCE };
  private locationListeners = new Set<(location: ReaderLocation) => void>();
  private selectionListeners = new Set<(selection: ReaderSelection) => void>();
  private interactionListeners = new Set<ReaderInteractionHandler>();
  private instrumentedDocuments = new WeakSet<Document>();

  private readonly handleRelocated = (location: EpubLocation) => {
    const mapped = mapLocation(location);
    this.currentLocation = mapped;
    for (const listener of this.locationListeners) listener(mapped);
  };

  private readonly handleSelected = (cfiRange: string, contents: Contents) => {
    const text = contents.window.getSelection()?.toString().trim() ?? '';
    const selection: ReaderSelection = { cfiRange, text };
    for (const listener of this.selectionListeners) listener(selection);
  };

  private readonly handleRendered = (_section: unknown, view: RenderedView) => {
    if (view?.contents) this.handleContent(view.contents);
  };

  private readonly handleContent = (contents: Contents) => {
    const doc = contents.document;
    const win = contents.window;
    if (!doc || !win || this.instrumentedDocuments.has(doc)) return;
    this.instrumentedDocuments.add(doc);

    let pointerStart: PointerStart | null = null;
    let lastHandledInteractionAt = -Infinity;
    const hasSelection = () => Boolean(win.getSelection()?.toString().trim());

    const beginInteraction = (
      x: number,
      y: number,
      pointerType: ReaderPointerType,
      target: EventTarget | null,
    ) => {
      // Browsers that expose both Touch Events and Pointer Events may emit both for one
      // physical gesture. The first start event owns the gesture; the second is ignored.
      if (pointerStart) return;
      pointerStart = {
        x,
        y,
        time: performance.now(),
        pointerType,
        interactive: isInteractiveTarget(target),
      };
    };

    const cancelInteraction = () => {
      pointerStart = null;
    };

    const finishInteraction = (
      x: number,
      y: number,
      pointerType: ReaderPointerType,
      target: EventTarget | null,
    ): boolean => {
      if (!pointerStart) return false;

      const start = pointerStart;
      pointerStart = null;
      const effectivePointerType = start.pointerType === 'unknown' ? pointerType : start.pointerType;
      const deltaX = x - start.x;
      const deltaY = y - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const duration = performance.now() - start.time;
      const interactive = start.interactive || isInteractiveTarget(target);
      const selected = hasSelection();
      let interaction: ReaderContentInteraction | null = null;

      if (!interactive && !selected && effectivePointerType !== 'mouse' && duration <= 900 && absX >= 48 && absX > absY * 1.3) {
        interaction = {
          type: 'swipe',
          direction: deltaX < 0 ? 'left' : 'right',
          deltaX,
          deltaY,
          pointerType: effectivePointerType,
          interactive,
          hasSelection: selected,
        };
      } else if (!interactive && !selected && duration <= 650 && Math.hypot(deltaX, deltaY) <= 12) {
        // PointerEvent/Touch client coordinates are relative to the visible iframe viewport.
        // EPUB.js paginated documents can make the root element wider than that viewport,
        // so using the document width can collapse center/right taps into the previous zone.
        const width = Math.max(1, win.innerWidth || doc.documentElement?.clientWidth || 1);
        const height = Math.max(1, win.innerHeight || doc.documentElement?.clientHeight || 1);
        interaction = {
          type: 'tap',
          xRatio: clampRatio(x / width),
          yRatio: clampRatio(y / height),
          pointerType: effectivePointerType,
          interactive,
          hasSelection: selected,
        };
      }

      const handled = Boolean(interaction && this.emitInteraction(interaction));
      if (handled) lastHandledInteractionAt = performance.now();
      return handled;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      beginInteraction(
        event.clientX,
        event.clientY,
        normalizePointerType(event.pointerType),
        event.target,
      );
    };

    const handlePointerCancel = () => {
      cancelInteraction();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) {
        cancelInteraction();
        return;
      }
      if (finishInteraction(
        event.clientX,
        event.clientY,
        normalizePointerType(event.pointerType),
        event.target,
      )) event.preventDefault();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        cancelInteraction();
        return;
      }
      const touch = event.touches.item(0);
      if (!touch) {
        cancelInteraction();
        return;
      }
      beginInteraction(touch.clientX, touch.clientY, 'touch', touch.target ?? event.target);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0 || event.changedTouches.length === 0) {
        cancelInteraction();
        return;
      }
      const touch = event.changedTouches.item(0);
      if (!touch) {
        cancelInteraction();
        return;
      }
      if (finishInteraction(touch.clientX, touch.clientY, 'touch', touch.target ?? event.target)) {
        event.preventDefault();
      }
    };

    const handleTouchCancel = () => {
      cancelInteraction();
    };

    const handleClick = (event: MouseEvent) => {
      // Pointer/touch events remain primary. A synthesized compatibility click is ignored
      // when the same physical gesture was already handled, preventing double page turns.
      if (performance.now() - lastHandledInteractionAt < 800) return;
      if (isInteractiveTarget(event.target) || hasSelection()) return;

      const width = Math.max(1, win.innerWidth || doc.documentElement?.clientWidth || 1);
      const height = Math.max(1, win.innerHeight || doc.documentElement?.clientHeight || 1);
      const interaction: ReaderContentInteraction = {
        type: 'tap',
        xRatio: clampRatio(event.clientX / width),
        yRatio: clampRatio(event.clientY / height),
        pointerType: 'mouse',
        interactive: false,
        hasSelection: false,
      };
      if (this.emitInteraction(interaction)) {
        lastHandledInteractionAt = performance.now();
        event.preventDefault();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const interaction: ReaderContentInteraction = {
        type: 'key',
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        interactive: isInteractiveTarget(event.target),
        hasSelection: hasSelection(),
      };
      if (this.emitInteraction(interaction)) event.preventDefault();
    };

    doc.addEventListener('pointerdown', handlePointerDown, { passive: true });
    doc.addEventListener('pointerup', handlePointerUp);
    doc.addEventListener('pointercancel', handlePointerCancel, { passive: true });
    // WebKit/Safari can deliver touchscreen gestures to EPUB iframes through Touch Events
    // even when PointerEvent exists. The shared gesture state above deduplicates browsers
    // that emit both event families for the same physical tap/swipe.
    doc.addEventListener('touchstart', handleTouchStart, { passive: true });
    doc.addEventListener('touchend', handleTouchEnd, { passive: false });
    doc.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    // A compatibility click gives WebKit/Safari and assistive input a browser-agnostic tap
    // path when a touchscreen gesture does not surface through the iframe pointer/touch path.
    doc.addEventListener('click', handleClick);
    doc.addEventListener('keydown', handleKeyDown);
  };

  async open(source: string | ArrayBuffer, container: Element, options: ReaderOpenOptions = {}): Promise<void> {
    if (!(container instanceof Element)) {
      throw new ReaderEngineError('invalid-container', 'Reader container is not a DOM element.');
    }

    this.destroyRuntime();

    try {
      const book = ePub(source);
      await book.ready;
      this.book = book;

      const flow = options.flow ?? 'paginated';
      const spread = options.spread ?? 'auto';
      const rendition = book.renderTo(container, {
        width: '100%',
        height: '100%',
        flow: mapFlow(flow),
        spread: mapSpread(spread),
        minSpreadWidth: options.minSpreadWidth ?? 900,
        allowScriptedContent: false,
      });
      this.rendition = rendition;
      rendition.on('relocated', this.handleRelocated);
      rendition.on('selected', this.handleSelected);
      // `rendered` exposes the exact view Contents that owns the iframe document. This closes
      // WebKit timing/reflow gaps where the asynchronous content hook or getContents() snapshot
      // can miss the document that receives the user's next tap.
      rendition.on('rendered', this.handleRendered);
      rendition.hooks.content.register(this.handleContent);

      this.registerThemes();
      this.applyAppearance(options.appearance ?? {});
    } catch (error) {
      this.destroyRuntime();
      throw normalizeError('epub-open-failed', 'Unable to open EPUB publication.', error);
    }
  }

  destroy(): void {
    this.destroyRuntime();
    this.locationListeners.clear();
    this.selectionListeners.clear();
    this.interactionListeners.clear();
    this.currentLocation = null;
  }

  async display(target?: string): Promise<void> {
    const rendition = this.requireRendition();
    try {
      await rendition.display(target);
      this.instrumentVisibleContents();
    } catch (error) {
      throw normalizeError(target?.startsWith('epubcfi(') ? 'invalid-location' : 'epub-render-failed', 'Unable to display EPUB location.', error);
    }
  }

  async next(): Promise<void> {
    const rendition = this.requireRendition();
    try {
      await rendition.next();
      this.instrumentVisibleContents();
    } catch (error) {
      throw normalizeError('epub-render-failed', 'Unable to advance EPUB rendition.', error);
    }
  }

  async previous(): Promise<void> {
    const rendition = this.requireRendition();
    try {
      await rendition.prev();
      this.instrumentVisibleContents();
    } catch (error) {
      throw normalizeError('epub-render-failed', 'Unable to move to the previous EPUB rendition.', error);
    }
  }

  async getMetadata(): Promise<ReaderEngineMetadata> {
    const metadata = await this.requireBook().loaded.metadata;
    return {
      ...(nonEmpty(metadata.title) ? { title: metadata.title } : {}),
      ...(nonEmpty(metadata.creator) ? { creator: metadata.creator } : {}),
      ...(nonEmpty(metadata.language) ? { language: metadata.language } : {}),
      ...(nonEmpty(metadata.identifier) ? { identifier: metadata.identifier } : {}),
    };
  }

  async getNavigation(): Promise<ReaderTocItem[]> {
    const navigation = await this.requireBook().loaded.navigation;
    return mapToc(navigation.toc);
  }

  getCurrentLocation(): ReaderLocation | null {
    return this.currentLocation ? { ...this.currentLocation } : null;
  }

  async goToCfi(cfi: string): Promise<void> {
    if (!cfi.startsWith('epubcfi(')) throw new ReaderEngineError('invalid-location', 'Invalid EPUB CFI.');
    await this.display(cfi);
  }

  async goToHref(href: string): Promise<void> {
    if (!href.trim()) throw new ReaderEngineError('invalid-location', 'EPUB navigation target is empty.');
    await this.display(href);
  }

  setFlow(flow: ReaderFlow): void {
    this.requireRendition().flow(mapFlow(flow));
  }

  setSpread(spread: ReaderSpread, minSpreadWidth = 900): void {
    this.requireRendition().spread(mapSpread(spread), minSpreadWidth);
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    this.requireRendition().resize(safeWidth, safeHeight);
  }

  applyAppearance(next: Partial<ReaderAppearance>): void {
    const rendition = this.requireRendition();
    this.appearance = { ...this.appearance, ...next };
    const appearance = this.appearance;
    const themes = rendition.themes as typeof rendition.themes & { removeOverride(name: string): void };

    themes.select(appearance.theme);
    if (appearance.fontFamily === 'publisher') themes.removeOverride('font-family');
    else themes.font(FONT_STACKS[appearance.fontFamily]);
    themes.fontSize(`${Math.round(appearance.fontScale * 100)}%`);
    themes.override('line-height', String(appearance.lineHeight), true);
    themes.override('text-align', appearance.alignment, true);
    themes.override('--reader-paragraph-spacing', `${appearance.paragraphSpacing}em`, false);
  }

  async generateLocations(charactersPerLocation = 1600): Promise<ReaderLocationMap> {
    const locations = this.requireBook().locations;
    await locations.generate(charactersPerLocation);
    return { serialized: locations.save(), length: locations.length() };
  }

  loadLocations(serialized: string): ReaderLocationMap {
    const locations = this.requireBook().locations;
    locations.load(serialized);
    return { serialized: locations.save(), length: locations.length() };
  }

  percentageFromCfi(cfi: string): number | undefined {
    if (!cfi.startsWith('epubcfi(')) return undefined;
    const percentage = this.requireBook().locations.percentageFromCfi(cfi);
    return Number.isFinite(percentage) ? percentage : undefined;
  }

  onLocationChange(callback: (location: ReaderLocation) => void): Unsubscribe {
    this.locationListeners.add(callback);
    return () => this.locationListeners.delete(callback);
  }

  onSelection(callback: (selection: ReaderSelection) => void): Unsubscribe {
    this.selectionListeners.add(callback);
    return () => this.selectionListeners.delete(callback);
  }

  onInteraction(callback: ReaderInteractionHandler): Unsubscribe {
    this.interactionListeners.add(callback);
    return () => this.interactionListeners.delete(callback);
  }

  private emitInteraction(interaction: ReaderContentInteraction): boolean {
    let handled = false;
    for (const listener of this.interactionListeners) {
      if (listener(interaction) === true) handled = true;
    }
    return handled;
  }

  private instrumentVisibleContents(): void {
    const rendition = this.rendition;
    if (!rendition) return;

    // EPUB.js runs content hooks asynchronously. After a render promise resolves, inspect the
    // manager's currently visible Contents as well so interaction listeners are installed before
    // the reader can accept the next tap. handleContent() is idempotent per Document via WeakSet.
    const rendered = rendition.getContents() as unknown;
    const contents = Array.isArray(rendered)
      ? rendered as Contents[]
      : rendered
        ? [rendered as Contents]
        : [];
    for (const visible of contents) this.handleContent(visible);
  }

  private registerThemes(): void {
    const rendition = this.requireRendition();
    for (const [name, rules] of Object.entries(THEME_RULES)) rendition.themes.register(name, rules);
    rendition.themes.default({
      'html, body': {
        'max-width': 'none !important',
      },
      body: {
        margin: '0 !important',
        padding: '0 !important',
        '--reader-paragraph-spacing': '0em',
      },
      'p, li, blockquote, h1, h2, h3, h4, h5, h6': {
        'font-family': 'inherit !important',
      },
      'p, li, blockquote': {
        'line-height': 'inherit !important',
      },
      p: {
        'text-align': 'inherit !important',
        'margin-block-end': 'var(--reader-paragraph-spacing, 0em) !important',
      },
      img: {
        'max-width': '100% !important',
        height: 'auto !important',
      },
      table: {
        'max-width': '100%',
      },
    });
  }

  private requireBook(): Book {
    if (!this.book) throw new ReaderEngineError('engine-not-ready', 'EPUB engine is not open.');
    return this.book;
  }

  private requireRendition(): Rendition {
    if (!this.rendition) throw new ReaderEngineError('engine-not-ready', 'EPUB rendition is not ready.');
    return this.rendition;
  }

  private destroyRuntime(): void {
    if (this.rendition) {
      this.rendition.off('relocated', this.handleRelocated);
      this.rendition.off('selected', this.handleSelected);
      this.rendition.off('rendered', this.handleRendered);
      this.rendition.destroy();
    }
    this.rendition = undefined;
    if (this.book) this.book.destroy();
    this.book = undefined;
    this.instrumentedDocuments = new WeakSet<Document>();
    this.currentLocation = null;
  }
}