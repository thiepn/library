export type ReaderFlow = 'paginated' | 'scrolled';
export type ReaderSpread = 'auto' | 'single' | 'double';
export type ReaderTheme = 'light' | 'warm' | 'sepia' | 'gray' | 'dark' | 'black';
export type ReaderAlignment = 'left' | 'justify';
export type ReaderFontFamily = 'publisher' | 'literata' | 'serif' | 'sans' | 'accessible';

export interface ReaderAppearance {
  fontFamily: ReaderFontFamily;
  fontScale: number;
  lineHeight: number;
  paragraphSpacing: number;
  alignment: ReaderAlignment;
  theme: ReaderTheme;
}

export interface ReaderOpenOptions {
  flow?: ReaderFlow;
  spread?: ReaderSpread;
  minSpreadWidth?: number;
  appearance?: Partial<ReaderAppearance>;
}

export interface ReaderLayoutUpdate {
  flow?: ReaderFlow;
  spread?: ReaderSpread;
  minSpreadWidth?: number;
  width?: number;
  height?: number;
  preserveLocation?: boolean;
}

export interface ReaderLocation {
  cfi: string;
  href: string;
  index: number;
  location?: number;
  percentage?: number;
  displayedPage?: number;
  displayedTotal?: number;
  atStart: boolean;
  atEnd: boolean;
}

export interface ReaderTocItem {
  id: string;
  href: string;
  label: string;
  children: ReaderTocItem[];
}

export interface ReaderSelection {
  cfiRange: string;
  text: string;
}

export interface ReaderLocationMap {
  serialized: string;
  length: number;
}

export interface ReaderEngineMetadata {
  title?: string;
  creator?: string;
  language?: string;
  identifier?: string;
}

export type ReaderEngineErrorCode =
  | 'invalid-container'
  | 'epub-open-failed'
  | 'epub-render-failed'
  | 'invalid-location'
  | 'engine-not-ready';

export class ReaderEngineError extends Error {
  readonly code: ReaderEngineErrorCode;
  readonly cause?: unknown;

  constructor(code: ReaderEngineErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ReaderEngineError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export type Unsubscribe = () => void;
