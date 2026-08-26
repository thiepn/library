import type { ReaderThemeController } from './theme';
import type { ReaderTheme, Unsubscribe } from './types';
import {
  applyReaderPublicationCompatibility,
  READER_EPUB_COMPATIBILITY_PROFILE,
  type ReaderPublicationCompatibilityResult,
} from './publication-compatibility';

export interface ReaderCompatibilityState {
  profile: typeof READER_EPUB_COMPATIBILITY_PROFILE;
  theme: ReaderTheme;
  framesObserved: number;
  documentsApplied: number;
  failures: number;
}

export class ReaderPublicationCompatibilityController {
  private readonly root: HTMLElement;
  private readonly theme: ReaderThemeController;
  private readonly frames = new Set<HTMLIFrameElement>();
  private readonly listeners = new Set<(state: ReaderCompatibilityState) => void>();
  private observer: MutationObserver | undefined;
  private unsubscribeTheme: Unsubscribe | undefined;
  private currentTheme: ReaderTheme;
  private state: ReaderCompatibilityState;
  private scheduled = false;
  private destroyed = false;

  constructor(root: HTMLElement, theme: ReaderThemeController) {
    this.root = root;
    this.theme = theme;
    this.currentTheme = theme.snapshot.theme;
    this.state = {
      profile: READER_EPUB_COMPATIBILITY_PROFILE,
      theme: this.currentTheme,
      framesObserved: 0,
      documentsApplied: 0,
      failures: 0,
    };
  }

  get snapshot(): ReaderCompatibilityState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    this.root.dataset.readerCompatibility = READER_EPUB_COMPATIBILITY_PROFILE;
    this.unsubscribeTheme = this.theme.subscribe(({ theme }) => {
      this.currentTheme = theme;
      this.state = { ...this.state, theme };
      this.scanNow();
    });

    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => this.scheduleScan());
      this.observer.observe(this.root, { childList: true, subtree: true });
    }

    this.scanNow();
  }

  subscribe(listener: (state: ReaderCompatibilityState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  reapply(): void {
    this.assertUsable();
    this.scanNow();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = undefined;
    this.unsubscribeTheme?.();
    this.unsubscribeTheme = undefined;
    for (const frame of this.frames) frame.removeEventListener('load', this.handleFrameLoad);
    this.frames.clear();
    this.listeners.clear();
    delete this.root.dataset.readerCompatibility;
  }

  private readonly handleFrameLoad = (event: Event) => {
    const frame = event.currentTarget;
    if (frame instanceof HTMLIFrameElement) this.applyFrame(frame);
  };

  private scheduleScan(): void {
    if (this.scheduled || this.destroyed) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      if (!this.destroyed) this.scanNow();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else queueMicrotask(run);
  }

  private scanNow(): void {
    if (this.destroyed) return;
    const liveFrames = new Set(this.root.querySelectorAll<HTMLIFrameElement>('iframe'));

    for (const frame of this.frames) {
      if (liveFrames.has(frame)) continue;
      frame.removeEventListener('load', this.handleFrameLoad);
      this.frames.delete(frame);
    }

    for (const frame of liveFrames) {
      if (!this.frames.has(frame)) {
        this.frames.add(frame);
        frame.addEventListener('load', this.handleFrameLoad);
      }
      this.applyFrame(frame);
    }

    this.state = { ...this.state, framesObserved: this.frames.size };
    this.emit();
  }

  private applyFrame(frame: HTMLIFrameElement): ReaderPublicationCompatibilityResult | undefined {
    try {
      const document = frame.contentDocument;
      if (!document?.documentElement || !document.body) return undefined;
      const result = applyReaderPublicationCompatibility(document, this.currentTheme);
      if (result.applied && !result.reused) {
        this.state = { ...this.state, documentsApplied: this.state.documentsApplied + 1 };
      }
      return result;
    } catch {
      // The publication contract requires same-origin EPUB resources, but compatibility
      // hardening must remain best-effort and must never turn an otherwise readable book
      // into a fatal reader error if a malformed or isolated frame cannot be inspected.
      this.state = { ...this.state, failures: this.state.failures + 1 };
      return undefined;
    }
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader publication compatibility controller has been destroyed.');
  }
}
