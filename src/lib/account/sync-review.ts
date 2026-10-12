import type { LibraryBackup } from '../client/library-portability';
import type { BookNoteDocumentV1 } from '../knowledge/note-model';

export interface CopySummary {
  savedBooks: number;
  readingPositions: number;
  bookmarks: number;
  highlights: number;
  notebookNotes: number;
  notebookBooks: number;
  personalBooks: number;
}
export interface NoteComparison {
  localOnly: number;
  cloudOnly: number;
  changed: number;
  identical: number;
  changedTitles: string[];
}
const count=(collection: {records:unknown[]} | undefined):number=>collection?.records.length ?? 0;
export function summarizeCopy(backup:LibraryBackup):CopySummary {
  const main=backup.state.main,pdf=backup.state.pdf;
  const notes=main?.noteDocuments?.records ?? [];
  return {
    savedBooks:count(main?.favorites),
    readingPositions:count(main?.epubProgress)+count(main?.legacyProgress)+count(pdf?.progress),
    bookmarks:count(main?.bookmarks)+count(pdf?.bookmarks),
    highlights:count(main?.annotations)+count(pdf?.annotations),
    notebookNotes:notes.length,
    notebookBooks:new Set(notes.map(n=>n.workId)).size,
    personalBooks:backup.state.personalBooks?.records.length ?? 0,
  };
}
export function compareNotes(local:readonly BookNoteDocumentV1[],cloud:readonly BookNoteDocumentV1[]):NoteComparison {
  const l=new Map(local.map(n=>[n.id,n]));
  const c=new Map(cloud.map(n=>[n.id,n]));
  let localOnly=0,cloudOnly=0,changed=0,identical=0;
  const changedTitles:string[]=[];
  for(const [id,note] of l){
    const remote=c.get(id);
    if(!remote){localOnly++;continue;}
    if(JSON.stringify(remote)===JSON.stringify(note))identical++;
    else {changed++; if(changedTitles.length<8)changedTitles.push(note.title.trim()||'Untitled note');}
  }
  for(const id of c.keys())if(!l.has(id))cloudOnly++;
  return {localOnly,cloudOnly,changed,identical,changedTitles};
}
