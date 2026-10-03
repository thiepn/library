import { getWorks } from '../content/repository';
import { validBook, type Book } from './contract';
export async function hubCatalogue(): Promise<Book[]> {
  return (await getWorks()).flatMap(work => {
    const release = work.release;
    if (!release) return [];
    return (['epub', 'pdf'] as const).flatMap(format => {
      const book: Book = { workId: work.id, title: work.title, format, edition: release.edition, releaseVersion: release.version, slug: work.slug };
      return release.artifacts[format] && validBook(book) ? [book] : [];
    });
  });
}
