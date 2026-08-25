import '../../styles/reader-themes.css';
import { ReaderController } from './controller';
import type { ReaderTheme, Unsubscribe } from './types';

export interface ReaderThemeState {
  theme: ReaderTheme;
}

export type ReaderThemeOptions = Partial<ReaderThemeState>;

export const READER_THEME_DEFAULTS: ReaderThemeState = {
  theme: 'light',
};

const THEME_META_COLORS: Record<ReaderTheme, string> = {
  light: '#fbfbfa',
  warm: '#f7f3e8',
  sepia: '#efe3ca',
  gray: '#e7e8e8',
  dark: '#1c1d1e',
  black: '#000000',
};

function normalize(options: ReaderThemeOptions): ReaderThemeState {
  return { theme: options.theme ?? READER_THEME_DEFAULTS.theme };
}

export class ReaderThemeController {
  private readonly controller: ReaderController;
  private readonly root: HTMLElement;
  private readonly controlsHost: HTMLElement;
  private readonly documentElement: HTMLElement;
  private readonly body: HTMLElement | null;
  private readonly metaThemeColor: HTMLMetaElement | null;
  private readonly previousDocumentTheme: string | undefined;
  private readonly previousBodyTheme: string | undefined;
  private readonly previousMetaThemeColor: string | null;
  private readonly listeners = new Set<(state: ReaderThemeState) => void>();
  private state: ReaderThemeState;
  private started = false;
  private destroyed = false;

  constructor(controller: ReaderController, root: HTMLElement, initial: ReaderThemeOptions = {}) {
    this.controller = controller;
    this.root = root;
    this.state = normalize(initial);
    const doc = root.ownerDocument;
    this.documentElement = doc.documentElement;
    this.body = doc.body;
    this.metaThemeColor = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    this.previousDocumentTheme = this.documentElement.dataset.readerTheme;
    this.previousBodyTheme = this.body?.dataset.readerTheme;
    this.previousMetaThemeColor = this.metaThemeColor?.getAttribute('content') ?? null;
    this.controlsHost = this.mountControls();
    this.root.addEventListener('click', this.handleClick);
    this.syncDom();
  }

  get snapshot(): ReaderThemeState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    this.started = true;
    this.controller.setAppearance({ theme: this.state.theme });
    this.emit();
  }

  reapply(): void {
    this.assertUsable();
    this.syncDom();
    if (this.started) this.controller.setAppearance({ theme: this.state.theme });
  }

  setTheme(theme: ReaderTheme): void {
    this.assertUsable();
    if (theme === this.state.theme) return;
    this.state = { theme };
    this.syncDom();
    this.emit();
    if (this.started) this.controller.setAppearance({ theme });
  }

  reset(): void {
    this.setTheme(READER_THEME_DEFAULTS.theme);
  }

  subscribe(listener: (state: ReaderThemeState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.removeEventListener('click', this.handleClick);
    this.controlsHost.remove();
    this.listeners.clear();
    if (this.previousDocumentTheme === undefined) delete this.documentElement.dataset.readerTheme;
    else this.documentElement.dataset.readerTheme = this.previousDocumentTheme;
    if (this.body) {
      if (this.previousBodyTheme === undefined) delete this.body.dataset.readerTheme;
      else this.body.dataset.readerTheme = this.previousBodyTheme;
    }
    if (this.metaThemeColor) {
      if (this.previousMetaThemeColor === null) this.metaThemeColor.removeAttribute('content');
      else this.metaThemeColor.setAttribute('content', this.previousMetaThemeColor);
    }
  }

  private mountControls(): HTMLElement {
    const existing = this.root.querySelector<HTMLElement>('[data-reader-theme-controls]');
    if (existing) return existing;
    const panel = this.root.querySelector<HTMLElement>('[data-reader-appearance-panel]');
    if (!panel) throw new Error('Reader appearance panel is required for theme controls.');
    const heading = panel.querySelector<HTMLElement>('.reader-shell__panel-heading');

    const section = document.createElement('section');
    section.className = 'reader-shell__theme-controls';
    section.dataset.readerThemeControls = '';
    section.innerHTML = `
      <div class="reader-shell__setting-label">Theme</div>
      <div class="reader-shell__theme-grid" role="group" aria-label="Reader theme">
        <button type="button" data-reader-theme-option="light" aria-pressed="true"><span class="reader-shell__theme-swatch" data-reader-theme-swatch="light" aria-hidden="true"></span><span>Light</span></button>
        <button type="button" data-reader-theme-option="warm" aria-pressed="false"><span class="reader-shell__theme-swatch" data-reader-theme-swatch="warm" aria-hidden="true"></span><span>Warm</span></button>
        <button type="button" data-reader-theme-option="sepia" aria-pressed="false"><span class="reader-shell__theme-swatch" data-reader-theme-swatch="sepia" aria-hidden="true"></span><span>Sepia</span></button>
        <button type="button" data-reader-theme-option="gray" aria-pressed="false"><span class="reader-shell__theme-swatch" data-reader-theme-swatch="gray" aria-hidden="true"></span><span>Gray</span></button>
        <button type="button" data-reader-theme-option="dark" aria-pressed="false"><span class="reader-shell__theme-swatch" data-reader-theme-swatch="dark" aria-hidden="true"></span><span>Dark</span></button>
        <button type="button" data-reader-theme-option="black" aria-pressed="false"><span class="reader-shell__theme-swatch" data-reader-theme-swatch="black" aria-hidden="true"></span><span>Black</span></button>
      </div>
    `;
    if (heading) heading.insertAdjacentElement('afterend', section);
    else panel.prepend(section);
    return section;
  }

  private syncDom(): void {
    const theme = this.state.theme;
    this.root.dataset.readerTheme = theme;
    this.documentElement.dataset.readerTheme = theme;
    if (this.body) this.body.dataset.readerTheme = theme;
    if (this.metaThemeColor) this.metaThemeColor.setAttribute('content', THEME_META_COLORS[theme]);
    this.controlsHost.querySelectorAll<HTMLButtonElement>('[data-reader-theme-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.readerThemeOption === theme));
    });
  }

  private readonly handleClick = (event: MouseEvent) => {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin) return;
    const option = origin.closest<HTMLElement>('[data-reader-theme-option]');
    if (!option || !this.controlsHost.contains(option)) return;
    const value = option.dataset.readerThemeOption;
    if (value === 'light' || value === 'warm' || value === 'sepia' || value === 'gray' || value === 'dark' || value === 'black') {
      this.setTheme(value);
    }
  };

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader theme controller has been destroyed.');
  }
}
