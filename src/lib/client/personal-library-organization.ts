import {
  PERSONAL_BOOK_MAX_SHELVES,
  PERSONAL_BOOK_MAX_TAGS,
  normalizePersonalBookOrganization,
  type PersonalBookFormat,
  type PersonalBookOrganization,
  type PersonalBookSummary,
} from './personal-books';

export type PersonalLibrarySort =
  | 'updated'
  | 'added'
  | 'title'
  | 'creator'
  | 'size';

export interface PersonalLibraryFilters {
  query: string;
  format: 'all' | PersonalBookFormat;
  shelf: string;
  tag: string;
  sort: PersonalLibrarySort;
}

export interface PersonalLibraryFacets {
  shelves: string[];
  tags: string[];
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compareText(a: string | undefined, b: string | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base', numeric: true });
}

export function personalLibraryFacets(books: readonly PersonalBookSummary[]): PersonalLibraryFacets {
  const shelves = new Map<string, string>();
  const tags = new Map<string, string>();
  for (const book of books) {
    for (const shelf of book.shelves ?? []) shelves.set(normalizeSearch(shelf), shelf);
    for (const tag of book.tags ?? []) tags.set(normalizeSearch(tag), tag);
  }
  return {
    shelves: [...shelves.values()].sort(compareText),
    tags: [...tags.values()].sort(compareText),
  };
}

export function filterAndSortPersonalBooks(
  books: readonly PersonalBookSummary[],
  filters: PersonalLibraryFilters,
): PersonalBookSummary[] {
  const query = normalizeSearch(filters.query);
  const shelf = normalizeSearch(filters.shelf);
  const tag = normalizeSearch(filters.tag);

  const result = books.filter((book) => {
    if (filters.format !== 'all' && book.format !== filters.format) return false;
    if (shelf && !(book.shelves ?? []).some((value) => normalizeSearch(value) === shelf)) return false;
    if (tag && !(book.tags ?? []).some((value) => normalizeSearch(value) === tag)) return false;
    if (!query) return true;
    const haystack = normalizeSearch([
      book.title,
      book.creator ?? '',
      book.language ?? '',
      book.fileName,
      book.format,
      ...(book.shelves ?? []),
      ...(book.tags ?? []),
    ].join(' '));
    return haystack.includes(query);
  });

  return result.sort((a, b) => {
    if (filters.sort === 'title') return compareText(a.title, b.title) || b.updatedAt.localeCompare(a.updatedAt);
    if (filters.sort === 'creator') return compareText(a.creator, b.creator) || compareText(a.title, b.title);
    if (filters.sort === 'size') return b.size - a.size || compareText(a.title, b.title);
    if (filters.sort === 'added') return b.importedAt.localeCompare(a.importedAt) || compareText(a.title, b.title);
    return b.updatedAt.localeCompare(a.updatedAt) || compareText(a.title, b.title);
  });
}

export function parsePersonalOrganizationInput(
  shelvesRaw: string,
  tagsRaw: string,
): PersonalBookOrganization {
  const split = (value: string) => value.split(/[,\n]/g).map((item) => item.trim()).filter(Boolean);
  return normalizePersonalBookOrganization({
    shelves: split(shelvesRaw).slice(0, PERSONAL_BOOK_MAX_SHELVES),
    tags: split(tagsRaw).slice(0, PERSONAL_BOOK_MAX_TAGS),
  });
}
