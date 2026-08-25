import {
  getReaderProgress,
  setReaderProgress,
  type ReaderProgressRecordV2,
} from '../client/library-db';
import { ReaderController, type ReaderControllerState } from './controller';
import type { ReaderLocation, ReaderTocItem, Unsubscribe } from './types';

export interface ReaderProgressIdentity {
  workId: string;
  edition: number;
  releaseVersion: string;
}

export type ReaderResumeStatus =
  | 'none'
  | 'same-release'
  | 'stale-release'
  | 'storage-unavailable';

export interface ReaderResumeCandidate {
  status: ReaderResumeStatus;
  target?: string;
  saved?: ReaderProgressRecordV2;
}

export interface ReaderProgressControllerOptions {
  saveDebounceMs?: number;
}

const DEFAULT_SAVE_DEBOUNCE_MS = 250;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function comparableHref(value: string): string {
  return value.split('#', 1)[0] ?? value;
}

function findTocLabel(items: ReaderTocItem[], href: string): string | undefined {
  const target = comparableHref(href);
  for (const item of items) {
    if (comparableHref(item.href) === target && item.label.trim()) return item.label.trim();
    const nested = findTocLabel(item.children, href);
    if (nested) return nested;
  }
  return undefined;
}

export class ReaderProgressController {
  private readonly controller: ReaderController;
  private readonly identity: ReaderProgressIdentity;
  private readonly saveDebounceMs: number;
  private unsubscribeController: Unsubscribe | undefined;
  private saveTimer: number | undefined;
  private pending: ReaderProgressRecordV2 | undefined;
  private savedForRelease: ReaderProgressRecordV2 | undefined;
  private started = false;
  private destroyed = false;

  constructor(
    controller: ReaderController,
    identity: ReaderProgressIdentity,
    options: ReaderProgressControllerOptions = {},
  ) {
    this.controller = controller;
    this.identity = identity;
    this.saveDebounceMs = Math.max(80, options.saveDebounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS);
  }

  get publication(): ReaderProgressIdentity {
    return { ...this.identity };
  }

  async getResumeCandidate(): Promise<ReaderResumeCandidate> {
    this.assertUsable();
    try {
      const saved = await getReaderProgress(this.identity.workId);
      if (!saved) return { status: 'none' };
      if (
        saved.edition !== this.identity.edition
        || saved.releaseVersion !== this.identity.releaseVersion
      ) {
        return { status: 'stale-release', saved };
      }
      this.savedForRelease = saved;
      return { status: 'same-release', target: saved.cfi, saved };
    } catch {
      return { status: 'storage-unavailable' };
    }
  }

  start(): void {
    this.assertUsable();
    if (this.started) return;
    this.started = true;
    this.unsubscribeController = this.controller.subscribe((state) => this.capture(state));
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);
  }

  async flush(): Promise<void> {
    this.assertUsable();
    if (this.saveTimer !== undefined) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    const record = this.pending;
    this.pending = undefined;
    if (!record) return;
    try {
      await setReaderProgress(this.identity.workId, record);
      this.savedForRelease = {
        ...record,
        furthestPercentage: Math.max(
          record.furthestPercentage,
          this.savedForRelease?.furthestPercentage ?? 0,
        ),
      };
    } catch {
      // Reading must remain functional when IndexedDB is unavailable.
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.unsubscribeController?.();
    this.unsubscribeController = undefined;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.handlePageHide);
    void this.flushBeforeDestroy();
    this.destroyed = true;
  }

  private capture(state: ReaderControllerState): void {
    if (this.destroyed || state.status !== 'ready' || !state.location) return;
    const next = this.toRecord(state.location, state.toc);
    this.pending = next;
    this.scheduleSave();
  }

  private toRecord(location: ReaderLocation, toc: ReaderTocItem[]): ReaderProgressRecordV2 {
    const priorPercentage = this.pending?.percentage ?? this.savedForRelease?.percentage ?? 0;
    const percentage = location.percentage === undefined
      ? location.atStart
        ? 0
        : location.atEnd
          ? 1
          : priorPercentage
      : clamp01(location.percentage);
    const furthestPercentage = Math.max(
      percentage,
      this.pending?.furthestPercentage ?? 0,
      this.savedForRelease?.furthestPercentage ?? 0,
    );
    const chapterHref = location.href.trim() || undefined;
    const chapterLabel = chapterHref ? findTocLabel(toc, chapterHref) : undefined;

    return {
      schemaVersion: 2,
      workId: this.identity.workId,
      edition: this.identity.edition,
      releaseVersion: this.identity.releaseVersion,
      cfi: location.cfi,
      percentage,
      furthestPercentage,
      ...(chapterHref ? { chapterHref } : {}),
      ...(chapterLabel ? { chapterLabel } : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      void this.flush().catch(() => undefined);
    }, this.saveDebounceMs);
  }

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') void this.flush().catch(() => undefined);
  };

  private readonly handlePageHide = () => {
    void this.flush().catch(() => undefined);
  };

  private async flushBeforeDestroy(): Promise<void> {
    const record = this.pending;
    this.pending = undefined;
    if (!record) return;
    try {
      await setReaderProgress(this.identity.workId, record);
    } catch {
      // Best effort during teardown.
    }
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader progress controller has been destroyed.');
  }
}
