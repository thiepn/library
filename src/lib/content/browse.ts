export type BrowseFormat = 'epub' | 'pdf' | 'web';
export type BrowseSort = 'recent' | 'title' | 'author';

export interface BrowseBook {
  id: string;
  title: string;
  author: string;
  language: string;
  subjects: string[];
  formats: BrowseFormat[];
  searchText: string;
  updatedAt: string;
}

export interface BrowseFilters {
  query: string;
  subject: string;
  language: string;
  format: '' | BrowseFormat;
  sort: BrowseSort;
}

export const OTHER_SUBJECT = '__other';

export function isReaderFacingSubject(slug: string): boolean {
  // Preserve canonical source IDs; only hide opaque abbreviated codes from reader-facing filters.
  return /^[a-z][a-z0-9-]{3,}$/i.test(slug) && !/^\d+$/.test(slug);
}

export function searchableText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function visibleBrowseBooks<T extends BrowseBook>(
  books: readonly T[],
  filters: BrowseFilters,
): T[] {
  const query = searchableText(filters.query);
  const filtered = books.filter((book) => {
    const visibleSubjects = book.subjects.filter(isReaderFacingSubject);
    if (filters.subject === OTHER_SUBJECT && visibleSubjects.length) return false;
    if (filters.subject && filters.subject !== OTHER_SUBJECT && !visibleSubjects.includes(filters.subject)) return false;
    if (filters.language && book.language !== filters.language) return false;
    if (filters.format && !book.formats.includes(filters.format)) return false;
    if (query && !searchableText(book.searchText).includes(query)) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    const tie = a.id.localeCompare(b.id);
    if (filters.sort === 'title') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || tie;
    if (filters.sort === 'author') return a.author.localeCompare(b.author, undefined, { sensitivity: 'base' })
      || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || tie;
    const date = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    return (Number.isFinite(date) ? date : 0)
      || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || tie;
  });
}
