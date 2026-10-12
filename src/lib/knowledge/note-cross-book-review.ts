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


/**
 * A portable reading checklist, explicitly NOT a notebook backup or assessment.
 * Contains only IDs and source descriptors from currently available saved notes.
 */
export function crossBookReviewPacketMarkdown(
  collections:readonly ResearchCollection[],
  notes:readonly BookNoteDocumentV1[],
  workTitle:(workId:string)=>string,
  collectionId='all',
  filter:QueueFilter='all',
):string {
  const items=collectCrossBookReviewQueue(collections,notes,collectionId,filter,300);
  const groups=new Map<string,ResearchQueueItem[]>();
  for(const item of items){
    const group=groups.get(item.collectionName)??[];
    group.push(item);
    groups.set(item.collectionName,group);
  }
  const rows=[
    '# Cross-book research review','',
    '> THIEPN Library · exported temporary, self-reported review checklist.',
    '> No note text, mastery credit, assessed results, V2 backups or signing authority are included.',
    '',
    '- Source entries: '+items.length,
    '- Selected collection: '+(collectionId==='all'?'All collections':collectionId),
    '- Review filter: '+filter,'',
  ];
  for(const [collectionName,group] of groups){
    rows.push('## '+collectionName.replace(/[\r\n#]+/g,' ').trim(),'');
    for(const item of group){
      rows.push(
        (item.state==='reviewed'?'- [x] ':'- [ ] ')
        +workTitle(item.note.workId)+' — '+item.note.title.replace(/[\r\n]/g,' ').trim()
        +' · '+item.state+' · note:'+item.note.id,
        '  - Work ID: '+item.note.workId
        +' · note revision: '+item.note.revision
        +' · updated: '+item.note.updatedAt,
      );
    }
    rows.push('');
  }
  if(!groups.size)rows.push('_No review entries match the selected filters._','');
  return rows.join('\n');
}
