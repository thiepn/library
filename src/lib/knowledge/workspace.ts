export type KnowledgeFormat = 'epub' | 'pdf' | 'web';
export type KnowledgeKind = 'note' | 'highlight' | 'bookmark';
export type KnowledgeSort = 'newest' | 'oldest' | 'book';

export interface KnowledgeWorkspaceItem {
  key: string;
  kind: KnowledgeKind;
  format: KnowledgeFormat;
  workId: string;
  title: string;
  location: string;
  quote: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  href: string | undefined;
}

export interface KnowledgeWorkspaceFilters {
  query?: string;
  format?: KnowledgeFormat | 'all';
  kind?: KnowledgeKind | 'all';
  workId?: string | 'all';
  sort?: KnowledgeSort;
}

export interface KnowledgeWorkspaceSummary {
  total: number;
  notes: number;
  highlights: number;
  bookmarks: number;
  books: number;
}

function normalizedSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

export function filterKnowledgeWorkspace(
  items: readonly KnowledgeWorkspaceItem[],
  filters: KnowledgeWorkspaceFilters = {},
): KnowledgeWorkspaceItem[] {
  const query = normalizedSearch(filters.query?.trim() ?? '');
  const format = filters.format ?? 'all';
  const kind = filters.kind ?? 'all';
  const workId = filters.workId ?? 'all';
  const sort = filters.sort ?? 'newest';

  return items
    .filter((item) => {
      if (format !== 'all' && item.format !== format) return false;
      if (kind !== 'all' && item.kind !== kind) return false;
      if (workId !== 'all' && item.workId !== workId) return false;
      if (!query) return true;
      return normalizedSearch([
        item.title,
        item.location,
        item.quote,
        item.note,
        item.kind,
        item.format,
      ].join('\n')).includes(query);
    })
    .sort((a, b) => {
      if (sort === 'oldest') return a.updatedAt.localeCompare(b.updatedAt) || a.key.localeCompare(b.key);
      if (sort === 'book') {
        return a.title.localeCompare(b.title)
          || b.updatedAt.localeCompare(a.updatedAt)
          || a.key.localeCompare(b.key);
      }
      return b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key);
    });
}

export function summarizeKnowledgeWorkspace(
  items: readonly KnowledgeWorkspaceItem[],
): KnowledgeWorkspaceSummary {
  return {
    total: items.length,
    notes: items.filter((item) => item.kind === 'note').length,
    highlights: items.filter((item) => item.kind === 'highlight').length,
    bookmarks: items.filter((item) => item.kind === 'bookmark').length,
    books: new Set(items.map((item) => item.workId)).size,
  };
}

export function knowledgeWorkspaceMarkdown(
  items: readonly KnowledgeWorkspaceItem[],
  exportedAt = new Date().toISOString(),
): string {
  const ordered = [...items].sort((a, b) =>
    a.title.localeCompare(b.title)
    || a.location.localeCompare(b.location)
    || a.createdAt.localeCompare(b.createdAt)
    || a.key.localeCompare(b.key));

  const lines = ['# Library knowledge', '', `Exported ${exportedAt}`, ''];
  let previousWork = '';

  for (const item of ordered) {
    if (item.title !== previousWork) {
      lines.push(`## ${item.title}`, '');
      previousWork = item.title;
    }

    const kind = item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
    lines.push(`### ${item.location} · ${item.format.toUpperCase()} · ${kind}`, '');
    if (item.quote.trim()) lines.push(`> ${item.quote.trim().replace(/\n+/g, '\n> ')}`, '');
    if (item.note.trim()) lines.push(item.note.trim(), '');
    if (item.href) lines.push(`[Open in Library](${item.href})`, '');
    lines.push(`_Updated ${item.updatedAt}_`, '', '---', '');
  }

  return `${lines.join('\n').trim()}\n`;
}
