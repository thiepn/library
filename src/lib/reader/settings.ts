import { READER_PAGE_LAYOUT_DEFAULTS } from './page-layout';
import { READER_TYPOGRAPHY_DEFAULTS } from './typography';
import type {
  ReaderAlignment,
  ReaderAppearance,
  ReaderFlow,
  ReaderFontFamily,
  ReaderOpenOptions,
  ReaderPageMargins,
  ReaderSpread,
  ReaderTextWidth,
  ReaderTheme,
  Unsubscribe,
} from './types';

export const READER_SETTINGS_KEY = 'thiepn.library.reader.settings.v2';
export const READER_SETTINGS_SCHEMA_VERSION = 1 as const;

export interface ReaderSettingsRecord {
  schemaVersion: typeof READER_SETTINGS_SCHEMA_VERSION;
  fontFamily: ReaderFontFamily;
  fontScale: number;
  lineHeight: number;
  paragraphSpacing: number;
  alignment: ReaderAlignment;
  theme: ReaderTheme;
  textWidth: ReaderTextWidth;
  pageMargins: ReaderPageMargins;
  flow: ReaderFlow;
  spread: ReaderSpread;
}

export type ReaderSettingsPatch = Partial<Omit<ReaderSettingsRecord, 'schemaVersion'>>;

export const READER_SETTINGS_DEFAULTS: ReaderSettingsRecord = {
  schemaVersion: READER_SETTINGS_SCHEMA_VERSION,
  ...READER_TYPOGRAPHY_DEFAULTS,
  theme: 'light',
  ...READER_PAGE_LAYOUT_DEFAULTS,
  flow: 'paginated',
  spread: 'auto',
};

const FONT_FAMILIES: readonly ReaderFontFamily[] = ['publisher', 'literata', 'serif', 'sans', 'accessible'];
const ALIGNMENTS: readonly ReaderAlignment[] = ['left', 'justify'];
const THEMES: readonly ReaderTheme[] = ['light', 'warm', 'sepia', 'gray', 'dark', 'black'];
const TEXT_WIDTHS: readonly ReaderTextWidth[] = ['narrow', 'medium', 'wide'];
const PAGE_MARGINS: readonly ReaderPageMargins[] = ['small', 'medium', 'large'];
const FLOWS: readonly ReaderFlow[] = ['paginated', 'scrolled'];
const SPREADS: readonly ReaderSpread[] = ['auto', 'single', 'double'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChoice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T);
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function clampStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  return Number((Math.round(clamped / step) * step).toFixed(2));
}

function normalizeTrusted(record: ReaderSettingsRecord): ReaderSettingsRecord {
  return {
    ...record,
    schemaVersion: READER_SETTINGS_SCHEMA_VERSION,
    fontScale: clampStep(record.fontScale, 0.8, 1.8, 0.05),
    lineHeight: clampStep(record.lineHeight, 1.2, 2.1, 0.05),
    paragraphSpacing: clampStep(record.paragraphSpacing, 0, 1.2, 0.1),
  };
}

export function parseReaderSettings(value: unknown): ReaderSettingsRecord | null {
  if (!isRecord(value) || value.schemaVersion !== READER_SETTINGS_SCHEMA_VERSION) return null;
  if (!isChoice(value.fontFamily, FONT_FAMILIES)) return null;
  if (!isNumberInRange(value.fontScale, 0.8, 1.8)) return null;
  if (!isNumberInRange(value.lineHeight, 1.2, 2.1)) return null;
  if (!isNumberInRange(value.paragraphSpacing, 0, 1.2)) return null;
  if (!isChoice(value.alignment, ALIGNMENTS)) return null;
  if (!isChoice(value.theme, THEMES)) return null;
  if (!isChoice(value.textWidth, TEXT_WIDTHS)) return null;
  if (!isChoice(value.pageMargins, PAGE_MARGINS)) return null;
  if (!isChoice(value.flow, FLOWS)) return null;
  if (!isChoice(value.spread, SPREADS)) return null;

  return normalizeTrusted({
    schemaVersion: READER_SETTINGS_SCHEMA_VERSION,
    fontFamily: value.fontFamily,
    fontScale: value.fontScale,
    lineHeight: value.lineHeight,
    paragraphSpacing: value.paragraphSpacing,
    alignment: value.alignment,
    theme: value.theme,
    textWidth: value.textWidth,
    pageMargins: value.pageMargins,
    flow: value.flow,
    spread: value.spread,
  });
}

function settingsEqual(a: ReaderSettingsRecord, b: ReaderSettingsRecord): boolean {
  return a.fontFamily === b.fontFamily
    && a.fontScale === b.fontScale
    && a.lineHeight === b.lineHeight
    && a.paragraphSpacing === b.paragraphSpacing
    && a.alignment === b.alignment
    && a.theme === b.theme
    && a.textWidth === b.textWidth
    && a.pageMargins === b.pageMargins
    && a.flow === b.flow
    && a.spread === b.spread;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class ReaderSettingsStore {
  private readonly listeners = new Set<(settings: ReaderSettingsRecord) => void>();
  private storage: Storage | null;
  private state: ReaderSettingsRecord;
  private storageWorking: boolean;

  constructor(storage: Storage | null = browserStorage()) {
    this.storage = storage;
    this.storageWorking = storage !== null;
    this.state = { ...READER_SETTINGS_DEFAULTS };
    this.load();
  }

  get snapshot(): ReaderSettingsRecord {
    return { ...this.state };
  }

  get persistenceAvailable(): boolean {
    return this.storageWorking;
  }

  resolveOpenOptions(explicit: ReaderOpenOptions = {}): ReaderOpenOptions {
    const stored = this.snapshot;
    const storedAppearance: ReaderAppearance = {
      fontFamily: stored.fontFamily,
      fontScale: stored.fontScale,
      lineHeight: stored.lineHeight,
      paragraphSpacing: stored.paragraphSpacing,
      alignment: stored.alignment,
      theme: stored.theme,
      textWidth: stored.textWidth,
      pageMargins: stored.pageMargins,
    };
    return {
      ...explicit,
      flow: explicit.flow ?? stored.flow,
      spread: explicit.spread ?? stored.spread,
      appearance: { ...storedAppearance, ...(explicit.appearance ?? {}) },
    };
  }

  patch(patch: ReaderSettingsPatch): void {
    const next = normalizeTrusted({ ...this.state, ...patch, schemaVersion: READER_SETTINGS_SCHEMA_VERSION });
    if (settingsEqual(next, this.state)) return;
    this.state = next;
    this.persist();
    this.emit();
  }

  reset(): void {
    const next = { ...READER_SETTINGS_DEFAULTS };
    if (settingsEqual(next, this.state)) return;
    this.state = next;
    this.persist();
    this.emit();
  }

  subscribe(listener: (settings: ReaderSettingsRecord) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private load(): void {
    if (!this.storage) return;
    let raw: string | null;
    try {
      raw = this.storage.getItem(READER_SETTINGS_KEY);
    } catch {
      this.disablePersistence();
      return;
    }
    if (raw === null) return;

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      this.healCorruptRecord();
      return;
    }

    const parsed = parseReaderSettings(decoded);
    if (parsed) {
      this.state = parsed;
      return;
    }
    this.healCorruptRecord();
  }

  private healCorruptRecord(): void {
    this.state = { ...READER_SETTINGS_DEFAULTS };
    if (!this.storage || !this.storageWorking) return;
    try {
      this.storage.setItem(READER_SETTINGS_KEY, JSON.stringify(this.state));
    } catch {
      this.disablePersistence();
    }
  }

  private persist(): void {
    if (!this.storage || !this.storageWorking) return;
    try {
      this.storage.setItem(READER_SETTINGS_KEY, JSON.stringify(this.state));
    } catch {
      this.disablePersistence();
    }
  }

  private disablePersistence(): void {
    this.storageWorking = false;
    this.storage = null;
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
