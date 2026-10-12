import type { BookNoteScope, SourceAnchorV1 } from './note-model';

export interface NotebookRecoveryDraft {
  workId: string;
  scope: BookNoteScope;
  title: string;
  bodyMarkdown: string;
  id?: string;
  chapterKey?: string;
  anchor?: SourceAnchorV1;
}

const safeYaml = (value: string): string => JSON.stringify(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim());
const heading = (value: string): string => value.replace(/[\r\n]+/g, ' ').replace(/^#+\s*/, '').trim() || 'Untitled note';

export function notebookRecoveryMarkdown(draft: NotebookRecoveryDraft): string {
  const fields = [
    '---',
    'title: ' + safeYaml(draft.title),
    'thiepn_recovery_draft: true',
    'thiepn_book_id: ' + safeYaml(draft.workId),
    'thiepn_scope: ' + safeYaml(draft.scope),
    ...(draft.id ? ['thiepn_note_id: ' + safeYaml(draft.id)] : []),
    ...(draft.chapterKey ? ['thiepn_chapter_key: ' + safeYaml(draft.chapterKey)] : []),
    ...(draft.anchor ? ['thiepn_source_anchor_json: ' + safeYaml(JSON.stringify(draft.anchor))] : []),
    '---',
    '',
    '# ' + heading(draft.title),
    '',
    '> Recovery copy of the editor text. This file was **not** written to Library storage.',
    '> Keep it until your note is safely saved or restored.',
    '',
    draft.bodyMarkdown,
    '',
  ];
  return fields.join('\n');
}

/** Manual, explicit, offline recovery only. No IndexedDB, remote upload or implicit sync. */
export function downloadNotebookRecovery(draft: NotebookRecoveryDraft): void {
  const markdown = notebookRecoveryMarkdown(draft);
  const safeBook = draft.workId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64) || 'unknown-book';
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'thiepn-notebook-recovery-' + safeBook + '.md';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
