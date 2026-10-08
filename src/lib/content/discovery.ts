import type { ResolvedWork } from './repository';
import { taxonomyLabel } from './taxonomy';

export interface DiscoveryWork {
  id: string;
  slug: string;
  title: string;
  language: string;
  contributors: readonly unknown[];
  classification: {
    subjects: readonly string[];
    tags: readonly string[];
    collections: readonly string[];
  };
  relationships: {
    relatedWorks: readonly string[];
    prerequisites: readonly string[];
  };
}

export interface RelatedWorkRecommendation<T extends DiscoveryWork = ResolvedWork> {
  work: T;
  score: number;
  reasons: string[];
}

interface ScoredReason {
  score: number;
  label: string;
  strong: boolean;
}

function contributorAuthors(work: DiscoveryWork): Set<string> {
  const values = new Set<string>();
  for (const value of work.contributors) {
    if (!value || typeof value !== 'object') continue;
    const contributor = value as Record<string, unknown>;
    const role = String(contributor.role ?? '').trim().toLowerCase();
    if (!['author', 'creator', 'aut'].includes(role)) continue;
    const name = String(contributor.name ?? '').trim().toLocaleLowerCase();
    if (name) values.add(name);
  }
  return values;
}

function overlap(a: readonly string[], b: readonly string[]): string[] {
  const right = new Set(b);
  return [...new Set(a)].filter((value) => right.has(value));
}

function hasSharedAuthor(source: DiscoveryWork, candidate: DiscoveryWork): boolean {
  const sourceAuthors = contributorAuthors(source);
  if (!sourceAuthors.size) return false;
  return [...contributorAuthors(candidate)].some((name) => sourceAuthors.has(name));
}

function scoreCandidate(source: DiscoveryWork, candidate: DiscoveryWork): ScoredReason[] {
  const reasons: ScoredReason[] = [];

  if (source.relationships.relatedWorks.includes(candidate.id)) {
    reasons.push({ score: 120, label: 'Explicitly related', strong: true });
  } else if (candidate.relationships.relatedWorks.includes(source.id)) {
    reasons.push({ score: 100, label: 'Related from this book', strong: true });
  }

  if (source.relationships.prerequisites.includes(candidate.id)) {
    reasons.push({ score: 110, label: 'Prerequisite', strong: true });
  } else if (candidate.relationships.prerequisites.includes(source.id)) {
    reasons.push({ score: 95, label: 'Builds on this book', strong: true });
  }

  if (hasSharedAuthor(source, candidate)) {
    reasons.push({ score: 40, label: 'Same author', strong: true });
  }

  for (const collection of overlap(source.classification.collections, candidate.classification.collections).slice(0, 2)) {
    reasons.push({ score: 24, label: `Same collection · ${taxonomyLabel(collection)}`, strong: true });
  }

  for (const subject of overlap(source.classification.subjects, candidate.classification.subjects).slice(0, 3)) {
    reasons.push({ score: 12, label: `Shared subject · ${taxonomyLabel(subject)}`, strong: true });
  }

  for (const tag of overlap(source.classification.tags, candidate.classification.tags).slice(0, 5)) {
    reasons.push({ score: 4, label: `Shared topic · ${taxonomyLabel(tag)}`, strong: false });
  }

  return reasons;
}

export function rankRelatedWorks<T extends DiscoveryWork>(
  source: T,
  pool: readonly T[],
  limit = 4,
): RelatedWorkRecommendation<T>[] {
  return pool
    .filter((candidate) => candidate.id !== source.id)
    .map((candidate) => {
      const reasons = scoreCandidate(source, candidate);
      const strong = reasons.some((reason) => reason.strong);
      const score = strong
        ? reasons.reduce((total, reason) => total + reason.score, 0) + (candidate.language === source.language ? 1 : 0)
        : 0;
      return {
        work: candidate,
        score,
        reasons: reasons
          .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
          .map((reason) => reason.label)
          .slice(0, 2),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.work.title.localeCompare(b.work.title) || a.work.id.localeCompare(b.work.id))
    .slice(0, Math.max(0, limit));
}
