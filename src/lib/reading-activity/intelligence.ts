import type { ReadingLibraryState } from './model';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReadingIntelligenceSummary {
  total: number;
  started: number;
  inProgress: number;
  completed: number;
  savedForLater: number;
  recentlyActive: number;
  paused: number;
}

export interface ReadingIntelligenceCandidate<T> {
  value: T;
  state: ReadingLibraryState;
}

function activityTimestamp(state: ReadingLibraryState): number | undefined {
  if (!state.lastActivityAt) return undefined;
  const timestamp = Date.parse(state.lastActivityAt);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizedProgress(state: ReadingLibraryState): number {
  const primary = state.continuity.primary?.current;
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  return state.continuity.entries.reduce((max, entry) => Math.max(max, entry.current), 0);
}

export function readingActivityAgeDays(
  state: ReadingLibraryState,
  now = Date.now(),
): number | undefined {
  const timestamp = activityTimestamp(state);
  if (timestamp === undefined) return undefined;
  return Math.max(0, (now - timestamp) / DAY_MS);
}

export function isRecentlyActive(
  state: ReadingLibraryState,
  now = Date.now(),
  recentDays = 30,
): boolean {
  const age = readingActivityAgeDays(state, now);
  return age !== undefined && age <= recentDays;
}

export function isPausedReading(
  state: ReadingLibraryState,
  now = Date.now(),
  pausedAfterDays = 21,
): boolean {
  if (state.status !== 'in-progress') return false;
  const age = readingActivityAgeDays(state, now);
  return age !== undefined && age >= pausedAfterDays;
}

export function summarizeReadingIntelligence(
  states: readonly ReadingLibraryState[],
  now = Date.now(),
  recentDays = 30,
  pausedAfterDays = 21,
): ReadingIntelligenceSummary {
  return {
    total: states.length,
    started: states.filter((state) => state.status !== 'not-started' || Boolean(state.lastActivityAt)).length,
    inProgress: states.filter((state) => state.status === 'in-progress').length,
    completed: states.filter((state) => state.status === 'completed').length,
    savedForLater: states.filter((state) => state.status === 'not-started').length,
    recentlyActive: states.filter((state) => isRecentlyActive(state, now, recentDays)).length,
    paused: states.filter((state) => isPausedReading(state, now, pausedAfterDays)).length,
  };
}

export function rankPausedReading<T>(
  items: readonly ReadingIntelligenceCandidate<T>[],
  now = Date.now(),
  limit = 3,
  pausedAfterDays = 21,
): ReadingIntelligenceCandidate<T>[] {
  return items
    .filter(({ state }) => isPausedReading(state, now, pausedAfterDays))
    .sort((a, b) => {
      const aTimestamp = activityTimestamp(a.state) ?? 0;
      const bTimestamp = activityTimestamp(b.state) ?? 0;
      if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp;
      return normalizedProgress(b.state) - normalizedProgress(a.state);
    })
    .slice(0, Math.max(0, limit));
}
