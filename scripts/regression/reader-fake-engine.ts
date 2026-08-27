import type { ReaderEngine } from '../../src/lib/reader/engines/engine';
import type {
  ReaderAppearance,
  ReaderContentInteraction,
  ReaderEngineMetadata,
  ReaderFlow,
  ReaderInteractionHandler,
  ReaderLocation,
  ReaderLocationMap,
  ReaderOpenOptions,
  ReaderSelection,
  ReaderSpread,
  ReaderTocItem,
  Unsubscribe,
} from '../../src/lib/reader/types';

export const regressionLocation = (overrides: Partial<ReaderLocation> = {}): ReaderLocation => ({
  cfi: 'epubcfi(/6/2!/4/2/2)',
  href: 'text/chapter-1.xhtml',
  index: 0,
  atStart: false,
  atEnd: false,
  ...overrides,
});

export const regressionToc: ReaderTocItem[] = [
  {
    id: 'part-1',
    href: 'text/part-1.xhtml',
    label: 'Part I',
    children: [
      {
        id: 'chapter-1',
        href: 'text/chapter-1.xhtml',
        label: 'Chapter 1',
        children: [],
      },
    ],
  },
];

export class FakeReaderEngine implements ReaderEngine {
  openCalls: Array<{ source: string | ArrayBuffer; container: Element; options?: ReaderOpenOptions }> = [];
  displayCalls: Array<string | undefined> = [];
  nextCalls = 0;
  previousCalls = 0;
  cfiCalls: string[] = [];
  hrefCalls: string[] = [];
  flowCalls: ReaderFlow[] = [];
  spreadCalls: Array<{ spread: ReaderSpread; minSpreadWidth?: number }> = [];
  resizeCalls: Array<{ width: number; height: number }> = [];
  appearanceCalls: Array<Partial<ReaderAppearance>> = [];
  generateLocationCalls: number[] = [];
  loadedLocationPayloads: string[] = [];
  destroyCalls = 0;

  navigation: ReaderTocItem[] = regressionToc;
  metadata: ReaderEngineMetadata = { title: 'Synthetic Regression Book', language: 'en' };
  currentLocation: ReaderLocation | null = null;
  locationPercentages = new Map<string, number>();
  locationMap: ReaderLocationMap = { serialized: '["epubcfi(/6/2!/4/2/2)"]', length: 1 };
  openError: unknown;
  displayFailures = new Map<string, unknown>();

  private locationListeners = new Set<(location: ReaderLocation) => void>();
  private selectionListeners = new Set<(selection: ReaderSelection) => void>();
  private interactionListeners = new Set<ReaderInteractionHandler>();

  async open(source: string | ArrayBuffer, container: Element, options?: ReaderOpenOptions): Promise<void> {
    this.openCalls.push({ source, container, ...(options ? { options } : {}) });
    if (this.openError !== undefined) throw this.openError;
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.locationListeners.clear();
    this.selectionListeners.clear();
    this.interactionListeners.clear();
  }

  async display(target?: string): Promise<void> {
    this.displayCalls.push(target);
    if (target !== undefined && this.displayFailures.has(target)) {
      const failure = this.displayFailures.get(target);
      this.displayFailures.delete(target);
      throw failure;
    }
  }

  async next(): Promise<void> { this.nextCalls += 1; }
  async previous(): Promise<void> { this.previousCalls += 1; }
  async getMetadata(): Promise<ReaderEngineMetadata> { return this.metadata; }
  async getNavigation(): Promise<ReaderTocItem[]> { return this.navigation; }
  getCurrentLocation(): ReaderLocation | null { return this.currentLocation; }
  async goToCfi(cfi: string): Promise<void> { this.cfiCalls.push(cfi); }
  async goToHref(href: string): Promise<void> { this.hrefCalls.push(href); }
  setFlow(flow: ReaderFlow): void { this.flowCalls.push(flow); }
  setSpread(spread: ReaderSpread, minSpreadWidth?: number): void {
    this.spreadCalls.push({ spread, ...(minSpreadWidth !== undefined ? { minSpreadWidth } : {}) });
  }
  resize(width: number, height: number): void { this.resizeCalls.push({ width, height }); }
  applyAppearance(appearance: Partial<ReaderAppearance>): void { this.appearanceCalls.push(appearance); }

  async generateLocations(charactersPerLocation = 1600): Promise<ReaderLocationMap> {
    this.generateLocationCalls.push(charactersPerLocation);
    return this.locationMap;
  }

  loadLocations(serialized: string): ReaderLocationMap {
    this.loadedLocationPayloads.push(serialized);
    return this.locationMap;
  }

  percentageFromCfi(cfi: string): number | undefined { return this.locationPercentages.get(cfi); }

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

  emitLocation(location: ReaderLocation): void {
    this.currentLocation = location;
    for (const listener of this.locationListeners) listener(location);
  }

  emitSelection(selection: ReaderSelection): void {
    for (const listener of this.selectionListeners) listener(selection);
  }

  emitInteraction(interaction: ReaderContentInteraction): boolean {
    let handled = false;
    for (const listener of this.interactionListeners) {
      if (listener(interaction) === true) handled = true;
    }
    return handled;
  }
}
