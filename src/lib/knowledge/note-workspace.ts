import { extractNotebookLinks } from './note-links';
import type { BookNoteDocumentV1 } from './note-model';

/**
 * Topics live in the author's Markdown as #topic/name. The original note store,
 * backup V2 format, scope-based uniqueness and reader anchors remain unchanged.
 */
export const TOPIC_MARKER = '#topic/';
export interface NotebookTopic { id: string; count: number }
export interface NotebookTemplate {
  id: string;
  label: string;
  description: string;
  markdown: string;
}
export const NOTEBOOK_TEMPLATES: readonly NotebookTemplate[] = [
  {
    id: 'reading-reflection', label: 'Reading reflection',
    description: 'Observation, interpretation and personal questions',
    markdown: '## What stood out\n\n\n## Why it matters\n\n\n## Questions to revisit\n\n- \n\n## Connected ideas\n\n',
  },
  {
    id: 'chapter-study', label: 'Chapter study',
    description: 'Summarize arguments, supporting evidence and open questions',
    markdown: '## Main argument\n\n\n## Supporting details\n\n- \n\n## Quotes or locations\n\n- \n\n## My critique\n\n\n## Follow-up\n\n- [ ] \n',
  },
  {
    id: 'concept-card', label: 'Concept card',
    description: 'Define and relate an important concept',
    markdown: '## Definition in my own words\n\n\n## Example\n\n\n## Counterexample\n\n\n## How it connects\n\n\n## Sources\n\n',
  },
  {
    id: 'compare-books', label: 'Compare two books',
    description: 'Organize similarities and differences across readings',
    markdown: '## Question or theme\n\n\n| Perspective | Book A | Book B |\n| --- | --- | --- |\n| Main claim |  |  |\n| Evidence |  |  |\n| Open question |  |  |\n\n## My synthesis\n\n\n## Related notes\n\n',
  },
  {
    id: 'discussion', label: 'Discussion preparation',
    description: 'Prepare thoughtful questions and action points',
    markdown: '## Big idea\n\n\n## Discussion questions\n\n1. \n2. \n3. \n\n## Responses to explore\n\n\n## Action points\n\n- [ ] \n',
  },
  {
    id: 'research-trail', label: 'Research trail',
    description: 'Keep claims, evidence and next steps in one place',
    markdown: '## Working question\n\n\n## Current understanding\n\n\n## Evidence and sources\n\n- \n\n## What could change my mind?\n\n\n## Next steps\n\n- [ ] \n',
  },
];

/** Explicit slug keeps organization editable and portable without added metadata fields. */
export function normalizeNotebookTopic(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
    .replace(/[\s_]+/gu, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

const TOPIC_REGEX = /(^|[\s([{:;,])#topic\/([\p{L}\p{N}][\p{L}\p{N}-]{0,47})(?=$|[\s)\]}.,!?;:])/gmu;
export function extractNotebookTopics(markdown: string): string[] {
  // Do not treat instructions inside fenced or inline code as organization metadata.
  const text = markdown.replace(/(^|\n)[ \t]*\`{3,}[^\n]*\n[\s\S]*?\n[ \t]*\`{3,}[^\n]*(?=\n|$)/g, '\n')
    .replace(/\`[^\`\r\n]*\`/g, '');
  const found = new Set<string>();
  for (const match of text.matchAll(TOPIC_REGEX)) {
    const normalized = normalizeNotebookTopic(match[2]);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

export function collectNotebookTopics(notes: readonly BookNoteDocumentV1[]): NotebookTopic[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const topic of extractNotebookTopics(note.bodyMarkdown))
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export interface NotebookOverview {
  total: number;
  books: number;
  topics: number;
  links: number;
  unlinked: number;
  recentlyUpdated: BookNoteDocumentV1[];
  topicCounts: NotebookTopic[];
}

export function buildNotebookOverview(notes: readonly BookNoteDocumentV1[]): NotebookOverview {
  const ids = new Set(notes.map(note => note.id));
  const topics = collectNotebookTopics(notes);
  let links = 0;
  let unlinked = 0;
  for (const note of notes) {
    const outgoing = extractNotebookLinks(note.bodyMarkdown).filter(link => ids.has(link.id));
    links += outgoing.length;
    if (!outgoing.length && !notes.some(other =>
      other.id !== note.id && extractNotebookLinks(other.bodyMarkdown).some(link => link.id === note.id)
    )) unlinked++;
  }
  return {
    total: notes.length,
    books: new Set(notes.map(note => note.workId)).size,
    topics: topics.length,
    links,
    unlinked,
    recentlyUpdated: [...notes].sort((a,b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, 6),
    topicCounts: topics,
  };
}

/** Inserts a selected template at the cursor; it never replaces an existing note. */
export function insertNotebookText(
  text: string, start: number, end: number, insertion: string,
): { value: string; cursor: number } {
  const a = Math.max(0, Math.min(text.length, start));
  const b = Math.max(a, Math.min(text.length, end));
  const before = text.slice(0, a);
  const after = text.slice(b);
  const leading = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const trailing = after && !after.startsWith('\n') ? '\n\n' : '';
  const contents = leading + insertion.trimEnd() + '\n' + trailing;
  return { value: before + contents + after, cursor: a + contents.length };
}
