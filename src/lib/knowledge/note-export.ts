import { notebookTitle, type BookNoteDocumentV1, type SourceAnchorV1 } from './note-model';

const inline = (value: string): string => value.replace(/[\r\n\u2028\u2029]+/g, ' ').replaceAll(String.fromCharCode(96), "'").trim();
const yamlString = (value: string) => JSON.stringify(value.replace(/[\r\n\u2028\u2029]+/g, ' ').trim());

function source(anchor: SourceAnchorV1 | undefined): string {
  if (!anchor) return 'Source location: not recorded';
  if (anchor.format === 'web') return 'Web chapter: ' + inline(anchor.chapterId);
  if (anchor.format === 'pdf') return 'PDF page: ' + anchor.page
    + ' · Edition: ' + anchor.edition + ' · Release: ' + inline(anchor.releaseVersion);
  return 'EPUB chapter: ' + inline(anchor.chapterHref)
    + (anchor.chapterLabel ? ' (' + inline(anchor.chapterLabel) + ')' : '')
    + (anchor.cfi ? ' · CFI: ' + inline(anchor.cfi) : '')
    + ' · Edition: ' + anchor.edition + ' · Release: ' + inline(anchor.releaseVersion);
}

/** One self-contained Markdown file that Obsidian can import without proprietary metadata. */
export function bookNotebookToObsidianMarkdown(
  workId: string,
  workTitle: string,
  docs: readonly BookNoteDocumentV1[],
): string {
  const ordered = [...docs].filter(doc => doc.workId === workId).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const frontmatter = [
    '---',
    'title: ' + yamlString(workTitle),
    'thiepn_book_id: ' + yamlString(workId),
    'thiepn_export: book-notebook-v1',
    'note_count: ' + ordered.length,
    '---',
    '',
    '# ' + inline(workTitle),
    '',
  ];
  for (const doc of ordered) {
    frontmatter.push('## ' + inline(notebookTitle(doc)));
    frontmatter.push('');
    frontmatter.push('**Note ID:** ' + inline(doc.id));
    frontmatter.push('**Type:** ' + inline(doc.scope));
    frontmatter.push('**Location:** ' + source(doc.anchor));
    if (doc.chapterKey) frontmatter.push('**Chapter key:** ' + inline(doc.chapterKey));
    if (doc.sourceAnnotations.length) frontmatter.push('**Source annotations:** ' + doc.sourceAnnotations
      .map(ref => inline(ref.format) + ':' + inline(ref.id)).join(', '));
    frontmatter.push('**Created:** ' + inline(doc.createdAt));
    frontmatter.push('**Updated:** ' + inline(doc.updatedAt));
    frontmatter.push('');
    frontmatter.push(doc.bodyMarkdown.trim());
    frontmatter.push('');
    frontmatter.push('---');
    frontmatter.push('');
  }
  return frontmatter.join('\n') + '\n';
}
