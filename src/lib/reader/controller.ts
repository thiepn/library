import type { ReaderEngine } from './engines/engine';
import { EpubJsEngine } from './engines/epubjs';
import {
  ReaderEngineError,
  type ReaderAppearance,
  type ReaderFlow,
  type ReaderLocation,
  type ReaderOpenOptions,
  type ReaderSelection,
  type ReaderSpread,
  type ReaderTocItem,
  type Unsubscribe,
} from './types';

export type ReaderStatus = 'idle' | 'loading' | 'ready' | 'error' | 'destroyed';

export interface ReaderControllerState {
  status: ReaderStatus;
  location: ReaderLocation | null;
  toc: ReaderTocItem[];
  error: ReaderEngineError | null;
}

export class ReaderController {
  private readonly engine: ReaderEngine;
  private state: ReaderControllerState = { status: 'idle', location: null, toc: [], error: null };
  private stateListeners = new Set<(state: ReaderControllerState) => void>();
  private selectionListeners = new Set<(selection: ReaderSelection) => void>();
  private unsubscribeLocation?: Unsubscribe;
  private unsubscribeSelection?: Unsubscribe;

  constructor(engine: ReaderEngine = new EpubJsEngine()) {
    this.engine = engine;
  }

  get snapshot(): ReaderControllerState {
    return { ...this.state, toc: [...this.state.toc], location: this.state.location ? { ...this.state.location } : null };
  }

  async open(source: string | ArrayBuffer, container: Element, options: ReaderOpenOptions = {}, target?: string): Promise<void> {
    this.assertUsable();
    this.setState({ status: 'loading', location: null, toc: [], error: null });
    this.attachEngineListeners();

    try {
      await this.engine.open(source, container, options);
      const toc = await this.engine.getNavigation();
      try {
        await this.engine.display(target);
      } catch (error) {
        if (!target) throw error;
        await this.engine.display();
      }
      this.setState({ ...this.state, status: 'ready', toc, error: null });
    } catch (error) {
      const normalized = error instanceof ReaderEngineError
        ? error
        : new ReaderEngineError('epub-open-failed', 'Unable to initialize EPUB reader.', error);
      this.setState({ ...this.state, status: 'error', error: normalized });
      throw normalized;
    }
  }

  async next(): Promise<void> {
    this.requireReady();
    await this.engine.next();
  }

  async previous(): Promise<void> {
    this.requireReady();
    await this.engine.previous();
  }

  async goTo(target: string): Promise<void> {
    this.requireReady();
    if (target.startsWith('epubcfi(')) await this.engine.goToCfi(target);
    else await this.engine.goToHref(target);
  }

  setFlow(flow: ReaderFlow): void {
    this.requireReady();
    this.engine.setFlow(flow);
  }

  setSpread(spread: ReaderSpread, minSpreadWidth?: number): void {
    this.requireReady();
    this.engine.setSpread(spread, minSpreadWidth);
  }

  setAppearance(appearance: Partial<ReaderAppearance>): void {
    this.requireReady();
    this.engine.applyAppearance(appearance);
  }

  subscribe(listener: (state: ReaderControllerState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    listener(this.snapshot);
    return () => this.stateListeners.delete(listener);
  }

  onSelection(listener: (selection: ReaderSelection) => void): Unsubscribe {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  destroy(): void {
    if (this.state.status === 'destroyed') return;
    this.unsubscribeLocation?.();
    this.unsubscribeSelection?.();
    this.unsubscribeLocation = undefined;
    this.unsubscribeSelection = undefined;
    this.engine.destroy();
    this.stateListeners.clear();
    this.selectionListeners.clear();
    this.state = { status: 'destroyed', location: null, toc: [], error: null };
  }

  private attachEngineListeners(): void {
    this.unsubscribeLocation?.();
    this.unsubscribeSelection?.();
    this.unsubscribeLocation = this.engine.onLocationChange((location) => {
      this.setState({ ...this.state, location });
    });
    this.unsubscribeSelection = this.engine.onSelection((selection) => {
      for (const listener of this.selectionListeners) listener(selection);
    });
  }

  private setState(next: ReaderControllerState): void {
    this.state = next;
    const snapshot = this.snapshot;
    for (const listener of this.stateListeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.state.status === 'destroyed') throw new ReaderEngineError('engine-not-ready', 'ReaderController has been destroyed.');
  }

  private requireReady(): void {
    this.assertUsable();
    if (this.state.status !== 'ready') throw new ReaderEngineError('engine-not-ready', 'ReaderController is not ready.');
  }
}
