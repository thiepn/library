import { getCollection, type CollectionEntry } from 'astro:content';

export type ChapterEntry = CollectionEntry<'chapters'>;

export interface ResolvedChapter {
  entry: ChapterEntry;
  workId: string;
  fileName: string;
}

function workIdFromEntry(entry: ChapterEntry) {
  return entry.id.split('/')[0] ?? '';
}

function fileNameFromEntry(entry: ChapterEntry) {
  if (entry.filePath) return entry.filePath.split(/[\\/]/).at(-1) ?? '';
  return `${entry.id.split('/').at(-1) ?? entry.data.id}.md`;
}

export async function getChaptersForWork(workId: string): Promise<ResolvedChapter[]> {
  const entries = await getCollection('chapters', (entry) => workIdFromEntry(entry) === workId && entry.data.status === 'published');
  return entries
    .map((entry) => ({ entry, workId, fileName: fileNameFromEntry(entry) }))
    .sort((a, b) => a.entry.data.order - b.entry.data.order || a.entry.data.title.localeCompare(b.entry.data.title));
}

export async function getChapter(workId: string, chapterId: string) {
  return (await getChaptersForWork(workId)).find((chapter) => chapter.entry.data.id === chapterId);
}
