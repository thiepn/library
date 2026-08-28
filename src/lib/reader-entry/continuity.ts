export type ReadingFormat = 'epub' | 'pdf' | 'web';

export interface ReadingEntryState {
  format: ReadingFormat;
  href: string;
  current: number;
  furthest: number;
  updatedAt?: string;
  page?: number;
  pageCount?: number;
  chapterLabel?: string;
}

export interface ReadingContinuitySnapshot {
  primary?: ReadingEntryState;
  entries: ReadingEntryState[];
}

const DEFAULT_ORDER: ReadingFormat[] = ['epub', 'web', 'pdf'];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeReadingEntry(entry: ReadingEntryState): ReadingEntryState {
  const current = clamp01(entry.current);
  return {
    ...entry,
    current,
    furthest: Math.max(current, clamp01(entry.furthest)),
  };
}

export function isReadingInProgress(entry: ReadingEntryState): boolean {
  const normalized = normalizeReadingEntry(entry);
  return normalized.current > 0 && normalized.current < 0.995;
}

export function choosePrimaryReadingEntry(entries: ReadingEntryState[]): ReadingEntryState | undefined {
  const normalized = entries.map(normalizeReadingEntry);
  if (!normalized.length) return undefined;

  const active = normalized
    .filter(isReadingInProgress)
    .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
  if (active[0]) return active[0];

  const started = normalized
    .filter((entry) => entry.current > 0)
    .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
  if (started[0]) return started[0];

  return DEFAULT_ORDER
    .map((format) => normalized.find((entry) => entry.format === format))
    .find((entry): entry is ReadingEntryState => Boolean(entry))
    ?? normalized[0];
}

export function formatReadingFormat(format: ReadingFormat): string {
  if (format === 'epub') return 'EPUB';
  if (format === 'pdf') return 'PDF';
  return 'Web';
}

export function readingActionLabel(entry?: ReadingEntryState): string {
  if (!entry || entry.current <= 0) return 'Start reading';
  return entry.current >= 0.995 ? 'Read again' : 'Continue reading';
}

export function readingPositionLabel(entry: ReadingEntryState): string {
  const format = formatReadingFormat(entry.format);
  if (entry.format === 'pdf' && entry.page && entry.pageCount) {
    return `${format} · page ${entry.page} of ${entry.pageCount}`;
  }
  const percent = Math.max(1, Math.round(clamp01(entry.current) * 100));
  const chapter = entry.chapterLabel ? ` · ${entry.chapterLabel}` : '';
  return `${format} · ${percent}%${chapter}`;
}

export function readingFurthestLabel(entry: ReadingEntryState): string {
  const format = formatReadingFormat(entry.format);
  if (entry.format === 'pdf' && entry.pageCount) {
    const page = Math.max(entry.page ?? 1, Math.round(clamp01(entry.furthest) * entry.pageCount));
    return `${format} furthest page ${page} of ${entry.pageCount}`;
  }
  return `${format} furthest ${Math.round(clamp01(entry.furthest) * 100)}%`;
}

export function createReadingContinuitySnapshot(entries: ReadingEntryState[]): ReadingContinuitySnapshot {
  const normalized = entries.map(normalizeReadingEntry);
  return { entries: normalized, primary: choosePrimaryReadingEntry(normalized) };
}
