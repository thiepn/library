import { ReaderController, type ReaderControllerState } from './controller';
import { ReaderLocationCache } from './location-cache';
import {
  ReaderProgressController,
  type ReaderProgressIdentity,
  type ReaderProgressState,
} from './progress';
import { ReaderShellController } from './shell';
import type { ReaderLocationMap, Unsubscribe } from './types';

export type ReaderProgressMapStatus = 'idle' | 'cache' | 'generating' | 'ready' | 'unavailable';
export type ReaderProgressStage = 'beginning' | 'reading' | 'near-end' | 'complete';

export interface ReaderProgressUxState {
  currentPercentage: number;
  furthestPercentage: number;
  chapterLabel?: string;
  mapStatus: ReaderProgressMapStatus;
  locationCount: number;
  stage: ReaderProgressStage;
  scrubbable: boolean;
}

export interface ReaderProgressUxOptions {
  charactersPerLocation?: number;
  generationDelayMs?: number;
}

const DEFAULT_CHARACTERS_PER_LOCATION = 1600;
const DEFAULT_GENERATION_DELAY_MS = 320;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function stageFor(current: number, furthest: number, atEnd: boolean): ReaderProgressStage {
  if (atEnd || furthest >= 0.995) return 'complete';
  if (current <= 0.005) return 'beginning';
  if (current >= 0.9) return 'near-end';
  return 'reading';
}

function parseLocationCfis(serialized: string): string[] {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.startsWith('epubcfi('));
  } catch {
    return [];
  }
}

export class ReaderProgressUxController {
  private readonly controller: ReaderController;
  private readonly progress: ReaderProgressController;
  private readonly shell: ReaderShellController;
  private readonly identity: ReaderProgressIdentity;
  private readonly cache = new ReaderLocationCache();
  private readonly charactersPerLocation: number;
  private readonly generationDelayMs: number;
  private readonly listeners = new Set<(state: ReaderProgressUxState) => void>();
  private cleanups: Unsubscribe[] = [];
  private generationTimer: number | undefined;
  private controllerState: ReaderControllerState;
  private progressState: ReaderProgressState;
  private serializedMap: string | undefined;
  private locationCfis: string[] = [];
  private started = false;
  private destroyed = false;
  private jumping = false;
  private state: ReaderProgressUxState;

  constructor(
    controller: ReaderController,
    progress: ReaderProgressController,
    shell: ReaderShellController,
    identity: ReaderProgressIdentity,
    options: ReaderProgressUxOptions = {},
  ) {
    this.controller = controller;
    this.progress = progress;
    this.shell = shell;
    this.identity = identity;
    this.charactersPerLocation = Math.max(500, Math.round(options.charactersPerLocation ?? DEFAULT_CHARACTERS_PER_LOCATION));
    this.generationDelayMs = Math.max(0, Math.round(options.generationDelayMs ?? DEFAULT_GENERATION_DELAY_MS));
    this.controllerState = controller.snapshot;
    this.progressState = progress.snapshot;
    this.state = {
      currentPercentage: this.progressState.currentPercentage,
      furthestPercentage: this.progressState.furthestPercentage,
      ...(this.progressState.chapterLabel ? { chapterLabel: this.progressState.chapterLabel } : {}),
      mapStatus: 'idle',
      locationCount: 0,
      stage: 'beginning',
      scrubbable: false,
    };
  }

  get snapshot(): ReaderProgressUxState {
    return { ...this.state };
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;
    this.cleanups.push(this.controller.subscribe((state) => {
      this.controllerState = state;
      this.syncDisplay();
    }));
    this.cleanups.push(this.progress.subscribe((state) => {
      this.progressState = state;
      this.syncDisplay();
    }));
    this.cleanups.push(this.shell.onProgressIntent((percentage) => {
      void this.jumpToPercentage(percentage).catch(() => undefined);
    }));
    void this.primeLocationMap();
  }

  async reapply(): Promise<void> {
    this.assertUsable();
    if (this.serializedMap) {
      try {
        const map = this.controller.loadLocations(this.serializedMap);
        this.acceptMap(map);
        return;
      } catch {
        this.serializedMap = undefined;
        this.locationCfis = [];
      }
    }
    void this.primeLocationMap();
  }

  subscribe(listener: (state: ReaderProgressUxState) => void): Unsubscribe {
    this.assertUsable();
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async jumpToPercentage(value: number): Promise<void> {
    this.assertUsable();
    if (this.jumping || this.state.mapStatus !== 'ready' || this.locationCfis.length === 0) return;
    const percentage = clamp01(value);
    const index = Math.min(this.locationCfis.length - 1, Math.max(0, Math.round(percentage * (this.locationCfis.length - 1))));
    const cfi = this.locationCfis[index];
    if (!cfi) return;

    this.jumping = true;
    this.syncDisplay();
    try {
      await this.controller.goTo(cfi);
      this.shell.announce(`Moved to ${Math.round(percentage * 100)}%`);
    } finally {
      this.jumping = false;
      this.syncDisplay();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.generationTimer !== undefined) window.clearTimeout(this.generationTimer);
    this.generationTimer = undefined;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.listeners.clear();
  }

  private async primeLocationMap(): Promise<void> {
    if (this.destroyed || this.controllerState.status !== 'ready') return;
    this.setMapStatus('cache');
    const cached = await this.cache.get(this.identity);
    if (this.destroyed || this.controllerState.status !== 'ready') return;

    if (cached) {
      try {
        const loaded = this.controller.loadLocations(cached.serialized);
        this.acceptMap(loaded);
        return;
      } catch {
        // A malformed/stale browser cache is ignored and regenerated for this exact release.
      }
    }

    this.scheduleGeneration();
  }

  private scheduleGeneration(): void {
    if (this.destroyed || this.generationTimer !== undefined) return;
    this.setMapStatus('generating');
    this.generationTimer = window.setTimeout(() => {
      this.generationTimer = undefined;
      void this.generateLocationMap();
    }, this.generationDelayMs);
  }

  private async generateLocationMap(): Promise<void> {
    if (this.destroyed || this.controllerState.status !== 'ready') return;
    try {
      const map = await this.controller.generateLocations(this.charactersPerLocation);
      if (this.destroyed) return;
      this.acceptMap(map);
      void this.cache.set(this.identity, map);
    } catch {
      if (!this.destroyed) this.setMapStatus('unavailable');
    }
  }

  private acceptMap(map: ReaderLocationMap): void {
    this.serializedMap = map.serialized;
    this.locationCfis = parseLocationCfis(map.serialized);
    this.state = {
      ...this.state,
      mapStatus: this.locationCfis.length > 0 ? 'ready' : 'unavailable',
      locationCount: map.length,
      scrubbable: this.locationCfis.length > 0 && !this.jumping,
    };
    this.syncDisplay();
  }

  private setMapStatus(mapStatus: ReaderProgressMapStatus): void {
    this.state = { ...this.state, mapStatus, scrubbable: mapStatus === 'ready' && !this.jumping };
    this.syncDisplay();
  }

  private syncDisplay(): void {
    if (this.destroyed) return;
    const location = this.controllerState.location;
    const current = clamp01(location?.percentage ?? this.progressState.currentPercentage);
    const furthest = Math.max(current, clamp01(this.progressState.furthestPercentage));
    const stage = stageFor(current, furthest, Boolean(location?.atEnd));
    const chapterLabel = this.progressState.chapterLabel;
    this.state = {
      ...this.state,
      currentPercentage: current,
      furthestPercentage: furthest,
      ...(chapterLabel ? { chapterLabel } : {}),
      stage,
      scrubbable: this.state.mapStatus === 'ready' && !this.jumping,
    };

    if (chapterLabel) this.shell.setChapter(chapterLabel);
    const mapBusy = this.state.mapStatus === 'cache' || this.state.mapStatus === 'generating';
    this.shell.setProgress({
      label: mapBusy && location?.percentage === undefined
        ? 'Calculating…'
        : `${Math.round(current * 100)}%`,
      percentage: current,
      furthestPercentage: furthest,
      stage,
      scrubbable: this.state.scrubbable,
      mapStatus: this.state.mapStatus,
    });

    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader progress UX controller has been destroyed.');
  }
}
