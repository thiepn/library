import type { ReadingActivityRecordV1 } from '../client/library-db';
import {
  isReadingInProgress,
  type ReadingContinuitySnapshot,
  type ReadingEntryState,
  type ReadingFormat,
} from '../reader-entry/continuity';

export type ReadingLibraryStatus = 'not-started' | 'in-progress' | 'completed';

export interface ReadingIdentity {
  workId: string;
  edition: number;
  releaseVersion: string;
}

export interface ReadingLibraryState {
  continuity: ReadingContinuitySnapshot;
  status: ReadingLibraryStatus;
  lastOpenedAt?: string;
  lastActivityAt?: string;
  lastFormat?: ReadingFormat;
}

interface FormatActivityEvent {
  format: ReadingFormat;
  at: string;
  timestamp: number;
}

function parsedTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isExactReadingActivity(
  activity: ReadingActivityRecordV1 | undefined,
  identity: ReadingIdentity,
): activity is ReadingActivityRecordV1 {
  return Boolean(
    activity
    && activity.workId === identity.workId
    && activity.edition === identity.edition
    && activity.releaseVersion === identity.releaseVersion,
  );
}

export function deriveReadingLibraryStatus(entries: ReadingEntryState[]): ReadingLibraryStatus {
  if (entries.some(isReadingInProgress)) return 'in-progress';
  if (entries.some((entry) => entry.current >= 0.995)) return 'completed';
  return 'not-started';
}

function newestFormatEvent(
  continuity: ReadingContinuitySnapshot,
  activity?: ReadingActivityRecordV1,
): FormatActivityEvent | undefined {
  const events: FormatActivityEvent[] = continuity.entries.flatMap((entry) => {
    const timestamp = parsedTimestamp(entry.updatedAt);
    return timestamp > 0 && entry.updatedAt
      ? [{ format: entry.format, at: entry.updatedAt, timestamp }]
      : [];
  });

  const openedTimestamp = parsedTimestamp(activity?.openedAt);
  if (activity && openedTimestamp > 0) {
    events.push({ format: activity.format, at: activity.openedAt, timestamp: openedTimestamp });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp)[0];
}

export function deriveReadingLibraryState(
  continuity: ReadingContinuitySnapshot,
  activity?: ReadingActivityRecordV1,
): ReadingLibraryState {
  const newest = newestFormatEvent(continuity, activity);
  const status = deriveReadingLibraryStatus(continuity.entries);
  return {
    continuity,
    status,
    ...(activity?.openedAt ? { lastOpenedAt: activity.openedAt } : {}),
    ...(newest ? { lastActivityAt: newest.at, lastFormat: newest.format } : {}),
  };
}

export function readingLibraryStatusLabel(status: ReadingLibraryStatus): string {
  if (status === 'in-progress') return 'Reading';
  if (status === 'completed') return 'Finished';
  return 'Saved for later';
}

export function hasReadingActivity(state: ReadingLibraryState): boolean {
  return Boolean(state.lastActivityAt || state.continuity.entries.some((entry) => entry.current > 0));
}

export function compareReadingRecency(a: ReadingLibraryState, b: ReadingLibraryState): number {
  return parsedTimestamp(b.lastActivityAt) - parsedTimestamp(a.lastActivityAt);
}

export function readingLibraryStatusRank(status: ReadingLibraryStatus): number {
  if (status === 'in-progress') return 0;
  if (status === 'not-started') return 1;
  return 2;
}
