export type ReaderFlow = 'paginated' | 'scrolled';
export type ReaderSpread = 'auto' | 'single' | 'double';
export type ReaderTheme = 'light' | 'warm' | 'sepia' | 'gray' | 'dark' | 'black';
export type ReaderAlignment = 'left' | 'justify';
export type ReaderFontFamily = 'publisher' | 'literata' | 'serif' | 'sans' | 'accessible';
export type ReaderTextWidth = 'narrow' | 'medium' | 'wide';
export type ReaderPageMargins = 'small' | 'medium' | 'large';
export type ReaderPointerType = 'mouse' | 'touch' | 'pen' | 'unknown';

export interface ReaderAppearance {
  fontFamily: ReaderFontFamily;
  fontScale: number;
  lineHeight: number;
  paragraphSpacing: number;
  alignment: ReaderAlignment;
  theme: ReaderTheme;
  textWidth?: ReaderTextWidth;
  pageMargins?: ReaderPageMargins;
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

export type ReaderContentInteraction =
  | {
      type: 'tap';
      xRatio: number;
      yRatio: number;
      pointerType: ReaderPointerType;
      interactive: boolean;
      hasSelection: boolean;
    }
  | {
      type: 'swipe';
      direction: 'left' | 'right';
      deltaX: number;
      deltaY: number;
      pointerType: ReaderPointerType;
      interactive: boolean;
      hasSelection: boolean;
    }
  | {
      type: 'wheel';
      deltaX: number;
      deltaY: number;
      shiftKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      interactive: boolean;
      hasSelection: boolean;
    }
  | {
      type: 'key';
      key: string;
      code: string;
      repeat: boolean;
      shiftKey: boolean;
      altKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      interactive: boolean;
      hasSelection: boolean;
    };

export type ReaderInteractionHandler = (interaction: ReaderContentInteraction) => boolean | void;

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
