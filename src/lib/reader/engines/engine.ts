import type {
  ReaderAppearance,
  ReaderEngineMetadata,
  ReaderFlow,
  ReaderLocation,
  ReaderLocationMap,
  ReaderOpenOptions,
  ReaderSelection,
  ReaderSpread,
  ReaderTocItem,
  Unsubscribe,
} from '../types';

export interface ReaderEngine {
  open(source: string | ArrayBuffer, container: Element, options?: ReaderOpenOptions): Promise<void>;
  destroy(): void;

  display(target?: string): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;

  getMetadata(): Promise<ReaderEngineMetadata>;
  getNavigation(): Promise<ReaderTocItem[]>;
  getCurrentLocation(): ReaderLocation | null;

  goToCfi(cfi: string): Promise<void>;
  goToHref(href: string): Promise<void>;

  setFlow(flow: ReaderFlow): void;
  setSpread(spread: ReaderSpread, minSpreadWidth?: number): void;
  resize(width: number, height: number): void;
  applyAppearance(appearance: Partial<ReaderAppearance>): void;

  generateLocations(charactersPerLocation?: number): Promise<ReaderLocationMap>;
  loadLocations(serialized: string): ReaderLocationMap;
  percentageFromCfi(cfi: string): number | undefined;

  onLocationChange(callback: (location: ReaderLocation) => void): Unsubscribe;
  onSelection(callback: (selection: ReaderSelection) => void): Unsubscribe;
}
