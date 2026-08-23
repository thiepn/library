import type { ResolvedWork } from './repository';

export type TaxonomyKind = 'subjects' | 'collections';

export interface TaxonomyItem {
  slug: string;
  label: string;
  count: number;
}

export function taxonomyLabel(slug: string): string {
  return slug.split('-').map((word) => word.toUpperCase() === 'AI' ? 'AI' : `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
}

export function getTaxonomyItems(works: ResolvedWork[], kind: TaxonomyKind): TaxonomyItem[] {
  const counts = new Map<string, number>();
  for (const work of works) {
    for (const slug of work.classification[kind]) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, count, label: taxonomyLabel(slug) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
