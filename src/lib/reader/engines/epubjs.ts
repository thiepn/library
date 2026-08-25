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
  type ReaderEngineMetadata,
  type ReaderFlow,
  type ReaderLocation,
  type ReaderLocationMap,
  type ReaderOpenOptions,
  type ReaderSelection,
  type ReaderSpread,
  type ReaderTocItem,
  type Unsubscribe,
} from '../types';

const DEFAULT_APPEARANCE: ReaderAppearance = {
  fontFamily: 'serif',
  fontScale: 1,
  lineHeight: 1.55,
  paragraphSpacing: 0,
  alignment: 'left',
  theme: 'light',
};

const THEME_RULES: Record<ReaderAppearance['theme'], Record<string, Record<string, string>>> = {
  light: { body: { color: '#1f211f', background: '#ffffff' }, a: { color: '#315f86' } },
  warm: { body: { color: '#27251f', background: '#f7f1e5' }, a: { color: '#6f552f' } },
  sepia: { body: { color: '#30271f', background: '#efe3ca' }, a: { color: '#75522f' } },
  gray: { body: { color: '#26282a', background: '#e7e8e8' }, a: { color: '#3d5f72' } },
  dark: { body: { color: '#e8e7e3', background: '#1c1d1e' }, a: { color: '#9bc8e6' } },
  black: { body: { color: '#efefed', background: '#000000' }, a: { color: '#abd5ef' } },
};

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
  return typeof value === 'string' && value.trim() ? value : undefined;
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
    this.currentLocation = null;
  }

  async display(target?: string): Promise<void> {
    const rendition = this.requireRendition();
    try {
      await rendition.display(target);
    } catch (error) {
      throw normalizeError(target?.startsWith('epubcfi(') ? 'invalid-location' : 'epub-render-failed', 'Unable to display EPUB location.', error);
    }
  }

  async next(): Promise<void> {
    try {
      await this.requireRendition().next();
    } catch (error) {
      throw normalizeError('epub-render-failed', 'Unable to advance EPUB rendition.', error);
    }
  }

  async previous(): Promise<void> {
    try {
      await this.requireRendition().prev();
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

    rendition.themes.select(appearance.theme);
    rendition.themes.font(appearance.fontFamily);
    rendition.themes.fontSize(`${Math.round(appearance.fontScale * 100)}%`);
    rendition.themes.override('line-height', String(appearance.lineHeight), true);
    rendition.themes.override('text-align', appearance.alignment, true);
    rendition.themes.override('margin-block-end', `${appearance.paragraphSpacing}em`, false);
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
      this.rendition.destroy();
    }
    this.rendition = undefined;
    if (this.book) this.book.destroy();
    this.book = undefined;
    this.currentLocation = null;
  }
}
