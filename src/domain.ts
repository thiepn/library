export type WorkFormatKind = 'web' | 'pdf' | 'epub';

export interface WorkFormat {
  kind: WorkFormatKind;
  href: string;
  label: string;
}

export interface CatalogWork {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  authors: string[];
  description: string;
  language: string;
  publishedAt: string;
  updatedAt?: string;
  topics: string[];
  readingMinutes?: number;
  chapterCount?: number;
  cover?: string;
  manifestHref: string;
  formats: WorkFormat[];
}

export interface Catalog {
  schemaVersion: 1;
  generatedAt: string;
  works: CatalogWork[];
}

export interface WorkPart {
  id: string;
  title: string;
  chapterIds: string[];
}

export interface ChapterRef {
  id: string;
  slug: string;
  title: string;
  number?: number;
  wordCount?: number;
  href: string;
}

export interface WorkManifest extends CatalogWork {
  schemaVersion: 1;
  edition?: string;
  license?: string;
  parts: WorkPart[];
  chapters: ChapterRef[];
}

export interface ChapterDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  kicker?: string;
  html: string;
  plainText?: string;
}

export interface SearchEntry {
  id: string;
  workId: string;
  workSlug: string;
  workTitle: string;
  chapterId?: string;
  chapterSlug?: string;
  title: string;
  text: string;
  topics?: string[];
}

export interface SearchIndex {
  schemaVersion: 1;
  entries: SearchEntry[];
}

export interface ReaderPreferences {
  appearance: 'system' | 'light' | 'dark';
  fontScale: number;
  lineHeight: number;
  measure: number;
}

export interface WorkProgress {
  chapterId?: string;
  chapterSlug?: string;
  percent: number;
  updatedAt: string;
}

export interface Annotation {
  id: string;
  workId: string;
  chapterId: string;
  quote?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryState {
  savedWorkIds: string[];
  progress: Record<string, WorkProgress>;
  preferences: ReaderPreferences;
  annotations: Annotation[];
}
