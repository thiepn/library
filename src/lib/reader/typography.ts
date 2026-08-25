import { ReaderController } from './controller';
import type { ReaderAlignment, ReaderAppearance, ReaderFontFamily, Unsubscribe } from './types';

export interface ReaderTypographyState extends Pick<ReaderAppearance, 'fontFamily' | 'fontScale' | 'lineHeight' | 'paragraphSpacing' | 'alignment'> {}
export type ReaderTypographyOptions = Partial<ReaderTypographyState>;

export const READER_TYPOGRAPHY_DEFAULTS: ReaderTypographyState = {
  fontFamily: 'publisher',
  fontScale: 1,
  lineHeight: 1.55,
  paragraphSpacing: 0,
  alignment: 'left',
};

function clampStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  return Number((Math.round(clamped / step) * step).toFixed(2));
}

function normalize(state: ReaderTypographyOptions): ReaderTypographyState {
  return {
    fontFamily: state.fontFamily ?? READER_TYPOGRAPHY_DEFAULTS.fontFamily,
    fontScale: clampStep(state.fontScale ?? READER_TYPOGRAPHY_DEFAULTS.fontScale, 0.8, 1.8, 0.05),
    lineHeight: clampStep(state.lineHeight ?? READER_TYPOGRAPHY_DEFAULTS.lineHeight, 1.2, 2.1, 0.05),
    paragraphSpacing: clampStep(state.paragraphSpacing ?? READER_TYPOGRAPHY_DEFAULTS.paragraphSpacing, 0, 1.2, 0.1),
    alignment: state.alignment ?? READER_TYPOGRAPHY_DEFAULTS.alignment,
  };
}

export class ReaderTypographyController {
  private readonly controller: ReaderController;
  private readonly listeners = new Set<(state: ReaderTypographyState) => void>();
  private state: ReaderTypographyState;
  private queue: Promise<void> = Promise.resolve();
  private applyVersion = 0;
  private destroyed = false;

  constructor(controller: ReaderController, initial: ReaderTypographyOptions = {}) {
    this.controller = controller;
    this.state = normalize(initial);
  }

  get snapshot(): ReaderTypographyState {
    return { ...this.state };
  }

  async start(): Promise<void> {
    this.assertUsable();
    await this.apply(true);
  }

  async reapply(): Promise<void> {
    this.assertUsable();
    await this.apply(true);
  }

  async setFontFamily(fontFamily: ReaderFontFamily): Promise<void> {
    await this.update({ fontFamily });
  }

  async setFontScale(fontScale: number): Promise<void> {
    await this.update({ fontScale });
  }

  async setLineHeight(lineHeight: number): Promise<void> {
    await this.update({ lineHeight });
  }

  async setParagraphSpacing(paragraphSpacing: number): Promise<void> {
    await this.update({ paragraphSpacing });
  }

  async setAlignment(alignment: ReaderAlignment): Promise<void> {
    await this.update({ alignment });
  }

  async reset(): Promise<void> {
    this.assertUsable();
    this.state = { ...READER_TYPOGRAPHY_DEFAULTS };
    this.emit();
    await this.apply(true);
  }

  subscribe(listener: (state: ReaderTypographyState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.applyVersion += 1;
    this.listeners.clear();
  }

  private async update(patch: ReaderTypographyOptions): Promise<void> {
    this.assertUsable();
    const next = normalize({ ...this.state, ...patch });
    if (
      next.fontFamily === this.state.fontFamily &&
      next.fontScale === this.state.fontScale &&
      next.lineHeight === this.state.lineHeight &&
      next.paragraphSpacing === this.state.paragraphSpacing &&
      next.alignment === this.state.alignment
    ) return;
    this.state = next;
    this.emit();
    await this.apply(false);
  }

  private async apply(force: boolean): Promise<void> {
    const version = ++this.applyVersion;
    const snapshot = this.snapshot;
    const task = async () => {
      if (this.destroyed) return;
      if (!force && version !== this.applyVersion) return;
      await this.controller.updateAppearance(snapshot, true);
    };
    const scheduled = this.queue.then(task, task);
    this.queue = scheduled.catch(() => undefined);
    await scheduled;
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader typography controller has been destroyed.');
  }
}
