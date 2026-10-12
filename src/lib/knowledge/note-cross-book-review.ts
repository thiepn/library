import type { BookNoteDocumentV1 } from './note-model';
import type { ResearchCollection } from './note-research';
import {
  alignResearchSession, readResearchSession, newResearchSession, storeResearchSession,
  markResearchSession, type ResearchTriage,
} from './note-research-session';

/**
 * A cross-collection view onto EXISTING browser-tab review sessions.
 * No extra reading-history table, new note store, grades or hidden sync.
 */
export interface ResearchQueueItem {
  note:BookNoteDocumentV1;
  collectionId:string;
  collectionName:string;
  state:ResearchTriage;
  position:number;
}
export type QueueFilter='pending'|'revisit'|'reviewed'|'all';
export function collectCrossBookReviewQueue(
  collections:readonly ResearchCollection[],
  notes:readonly BookNoteDocumentV1[],
  collectionId='all',
  filter:QueueFilter='pending',
  limit=150,
):ResearchQueueItem[] {
  const byId=new Map(notes.map(note=>[note.id,note]));
  const items:ResearchQueueItem[]=[];
  for(const collection of collections){
    if(collectionId!=='all'&&collectionId!==collection.id)continue;
    const session=readResearchSession(collection.id);
    if(!session)continue;
    for(const [position,row] of session.entries.entries()){
      const note=byId.get(row.id);
      if(!note || (filter!=='all'&&row.state!==filter))continue;
      items.push({
        note,collectionId:collection.id,collectionName:collection.name,
        state:row.state,position,
      });
    }
  }
  const priority:Record<ResearchTriage,number>={revisit:0,pending:1,reviewed:2};
  return items.sort((a,b)=>priority[a.state]-priority[b.state]
    ||a.collectionName.localeCompare(b.collectionName)
    ||a.position-b.position)
    .slice(0,Math.max(1,Math.min(300,limit)));
}
export function updateCrossBookReviewState(
  collection:ResearchCollection,
  existingNotes:readonly BookNoteDocumentV1[],
  noteId:string,
  state:ResearchTriage,
):void {
  const known=new Set(existingNotes.map(note=>note.id));
  if(!collection.noteIds.includes(noteId)||!known.has(noteId))
    throw new Error('This saved note is not an available source in the selected collection.');
  const ids=collection.noteIds.filter(id=>known.has(id));
  const previous=readResearchSession(collection.id);
  const session=previous?alignResearchSession(previous,ids)
    :newResearchSession(collection.id,ids);
  if(!session || !session.entries.some(entry=>entry.id===noteId))
    throw new Error('Review session is unavailable for this collection.');
  const updated=markResearchSession({...session,cursor:noteId},state);
  if(!storeResearchSession(updated))
    throw new Error('Unable to save the temporary review status in this browser tab.');
}
export function summarizeCrossBookQueue(
  collections:readonly ResearchCollection[],
  notes:readonly BookNoteDocumentV1[],
):{pending:number;revisit:number;reviewed:number;books:number;collections:number} {
  const all=collectCrossBookReviewQueue(collections,notes,'all','all',300);
  return {
    pending:all.filter(item=>item.state==='pending').length,
    revisit:all.filter(item=>item.state==='revisit').length,
    reviewed:all.filter(item=>item.state==='reviewed').length,
    books:new Set(all.map(item=>item.note.workId)).size,
    collections:new Set(all.map(item=>item.collectionId)).size,
  };
}
