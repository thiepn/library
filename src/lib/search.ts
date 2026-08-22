import type { SearchEntry } from '../domain';

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function searchEntries(entries: SearchEntry[], rawQuery: string) {
  const terms = normalize(rawQuery).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return entries
    .map((entry) => {
      const title = normalize(`${entry.workTitle} ${entry.title}`);
      const body = normalize(`${entry.text} ${(entry.topics ?? []).join(' ')}`);
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 8;
        if (body.includes(term)) score += 2;
      }
      return { entry, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 40);
}
