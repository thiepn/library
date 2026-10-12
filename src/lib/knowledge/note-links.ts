import { notebookTitle, type BookNoteDocumentV1 } from './note-model';

/**
 * Stable-ID links are stored directly in the existing Markdown body.
 * No notebook schema upgrade, side table, background sync, or hidden mutation.
 *
 * Syntax: [[note:<id>|Optional readable title]]
 */
export interface NotebookLink {
  id: string;
  label?: string;
}
export interface NotebookConnection {
  target: BookNoteDocumentV1;
  label: string;
  crossBook: boolean;
}
export interface NotebookGraph {
  outbound: NotebookConnection[];
  inbound: NotebookConnection[];
  missing: NotebookLink[];
}

const noteReference = /\[\[note:([A-Za-z0-9_-]{1,180})(?:\|([^\]\r\n]{1,200}))?\]\]/g;
const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().trim();

export function noteReferenceMarkdown(note: BookNoteDocumentV1): string {
  const label = notebookTitle(note).replace(/[\]\r\n|]/g, ' ').trim().slice(0, 120) || 'Untitled note';
  return '[[note:' + note.id + '|' + label + ']]';
}

/** Avoid inventing links out of Markdown code blocks or inline code examples. */
export function extractNotebookLinks(markdown: string): NotebookLink[] {
  const readable = markdown
    .replace(/(^|\n)[ \t]*\`{3,}[^\n]*\n[\s\S]*?\n[ \t]*\`{3,}[^\n]*(?=\n|$)/g, '\n')
    .replace(/\`[^\`\r\n]*\`/g, '');
  const found = new Map<string, NotebookLink>();
  for (const match of readable.matchAll(noteReference)) {
    if (!found.has(match[1])) found.set(match[1], {
      id: match[1],
      ...(match[2]?.trim() ? { label: match[2].trim() } : {}),
    });
  }
  return [...found.values()];
}

export function notebookConnections(
  active: BookNoteDocumentV1,
  documents: readonly BookNoteDocumentV1[],
  draftBody = active.bodyMarkdown,
): NotebookGraph {
  const lookup = new Map(documents.map(document => [document.id, document]));
  const requested = extractNotebookLinks(draftBody);
  const outbound: NotebookConnection[] = [];
  const missing: NotebookLink[] = [];
  for (const link of requested) {
    const document = lookup.get(link.id);
    if (document) outbound.push({
      target: document, label: link.label || notebookTitle(document),
      crossBook: active.workId !== document.workId,
    });
    else missing.push(link);
  }
  const inbound = documents
    .filter(document => document.id !== active.id
      && extractNotebookLinks(document.bodyMarkdown).some(link => link.id === active.id))
    .map(document => ({
      target: document, label: notebookTitle(document),
      crossBook: document.workId !== active.workId,
    }))
    .sort((a,b) => b.target.updatedAt.localeCompare(a.target.updatedAt));
  return { outbound, inbound, missing };
}

export function findNotebookNotes(
  documents: readonly BookNoteDocumentV1[],
  titleForWork: (workId: string) => string,
  query: string,
  limit = 80,
): BookNoteDocumentV1[] {
  const needle = normalize(query).slice(0, 250);
  const words = needle.split(/\s+/).filter(Boolean);
  const scored = documents.flatMap(document => {
    const title = normalize(notebookTitle(document));
    const work = normalize(titleForWork(document.workId));
    const chapter = normalize(document.chapterKey ?? '');
    const body = normalize(document.bodyMarkdown);
    if (!words.every(word =>
      title.includes(word) || work.includes(word) || chapter.includes(word) || body.includes(word)
    )) return [];
    const score = words.reduce((score, word) =>
      score + (title.includes(word) ? 6 : 0)
      + (chapter.includes(word) ? 4 : 0)
      + (work.includes(word) ? 3 : 0)
      + (body.includes(word) ? 1 : 0), 0);
    return [{ document, score }];
  });
  return scored.sort((a,b) => b.score-a.score
    || b.document.updatedAt.localeCompare(a.document.updatedAt)
    || a.document.id.localeCompare(b.document.id))
    .slice(0, Math.max(1, Math.min(200, limit)))
    .map(item => item.document);
}

export function notebookWordCount(markdown: string): number {
  const plain = markdown
    .replace(noteReference, (_, _id: string, label: string | undefined) => label ?? 'linked note')
    .replace(/[#*_\`>\[\]()~]/g, ' ')
    .trim();
  return plain ? (plain.match(/[^\s]+/gu)?.length ?? 0) : 0;
}

export type MarkdownTool = 'bold' | 'italic' | 'heading' | 'bullet' | 'number' | 'quote' | 'checkbox' | 'code';
export interface MarkdownEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Pure edit with cursor preservation, used by toolbar and keyboard shortcuts. */
export function applyNotebookMarkdownTool(
  value: string, from: number, to: number, tool: MarkdownTool,
): MarkdownEdit {
  const start = Math.max(0, Math.min(value.length, from));
  const end = Math.max(start, Math.min(value.length, to));
  const chosen = value.slice(start, end);
  const wrap: Partial<Record<MarkdownTool, string>> = { bold:'**', italic:'*', code:'\`' };
  if (wrap[tool]) {
    const delimiter = wrap[tool]!;
    const middle = chosen || (tool === 'code' ? 'code' : 'text');
    const insert = delimiter + middle + delimiter;
    return { value:value.slice(0,start)+insert+value.slice(end),
      selectionStart:start+delimiter.length,
      selectionEnd:start+delimiter.length+middle.length };
  }
  const lineStart = value.lastIndexOf('\n',Math.max(0,start-1))+1;
  const lineEndIndex = value.indexOf('\n',end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const segment = value.slice(lineStart,lineEnd);
  const lines = segment.split('\n');
  const prefix:Record<Exclude<MarkdownTool,'bold'|'italic'|'code'>, (index:number)=>string> = {
    heading:()=> '## ', bullet:()=>'- ', number:index=>(index+1)+'. ',
    quote:()=>'> ', checkbox:()=>'- [ ] ',
  };
  const newSegment = lines.map((line,index) => prefix[tool as keyof typeof prefix](index)+line).join('\n');
  return { value:value.slice(0,lineStart)+newSegment+value.slice(lineEnd),
    selectionStart:lineStart,selectionEnd:lineStart+newSegment.length };
}

export function insertNotebookReference(value:string,from:number,to:number,reference:string):MarkdownEdit {
  const start=Math.max(0,Math.min(value.length,from));
  const end=Math.max(start,Math.min(value.length,to));
  return { value:value.slice(0,start)+reference+value.slice(end),
    selectionStart:start+reference.length,selectionEnd:start+reference.length };
}
