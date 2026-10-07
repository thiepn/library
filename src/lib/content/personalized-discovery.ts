import { rankRelatedWorks, type DiscoveryWork } from './discovery';
import {
  hasReadingActivity,
  type ReadingLibraryState,
} from '../reading-activity/model';

export interface PersonalizedDiscoveryItem<T extends DiscoveryWork> {
  work: T;
  state: ReadingLibraryState;
  saved: boolean;
}

export interface PersonalizedDiscoveryRecommendation<T extends DiscoveryWork> {
  work: T;
  score: number;
  reasons: string[];
  sourceWorkId: string;
}

function parsedTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceBonus(state: ReadingLibraryState, now: number): number {
  let score = state.status === 'completed' ? 8 : state.status === 'in-progress' ? 4 : 0;
  const timestamp = parsedTimestamp(state.lastActivityAt);
  if (!timestamp) return score;
  const ageDays = Math.max(0, (now - timestamp) / (24 * 60 * 60 * 1000));
  if (ageDays <= 30) score += 6;
  else if (ageDays <= 90) score += 3;
  return score;
}

export function rankPersonalizedDiscovery<T extends DiscoveryWork>(
  items: readonly PersonalizedDiscoveryItem<T>[],
  enabled: boolean,
  now = Date.now(),
  limit = 4,
): PersonalizedDiscoveryRecommendation<T>[] {
  if (!enabled || limit <= 0) return [];

  const sources = items
    .filter(({ state }) => hasReadingActivity(state) && state.status !== 'not-started')
    .sort((a, b) => parsedTimestamp(b.state.lastActivityAt) - parsedTimestamp(a.state.lastActivityAt))
    .slice(0, 5);

  if (!sources.length) return [];

  const candidates = items.filter(({ state, saved }) => !saved && state.status === 'not-started');
  const ranked = candidates.flatMap(({ work: candidate }) => {
    const matches = sources.flatMap(({ work: source, state }) => {
      const related = rankRelatedWorks(source, [candidate], 1)[0];
      if (!related) return [];
      return [{
        work: candidate,
        score: related.score + sourceBonus(state, now),
        reasons: related.reasons,
        sourceWorkId: source.id,
      } satisfies PersonalizedDiscoveryRecommendation<T>];
    });
    return matches.sort((a, b) => b.score - a.score)[0] ? [matches.sort((a, b) => b.score - a.score)[0]!] : [];
  });

  return ranked
    .sort((a, b) => b.score - a.score || a.work.title.localeCompare(b.work.title) || a.work.id.localeCompare(b.work.id))
    .slice(0, limit);
}
