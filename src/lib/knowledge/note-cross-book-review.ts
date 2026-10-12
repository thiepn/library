import type { BookNoteDocumentV1 } from './note-model';
import { describeResearchSource, type ResearchCollection } from './note-research';
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
    .slice(0,Math.max(1,Math.min(3600,limit)));
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
):{pending:number;revisit:number;reviewed:number;books:number;collections:number;unavailable:number} {
  // Count every available session entry, not only the display window of 90/300.
  const present=new Map(notes.map(note=>[note.id,note]));
  const works=new Set<string>();
  let pending=0,revisit=0,reviewed=0,unavailable=0,participating=0;
  for(const collection of collections){
    const session=readResearchSession(collection.id);
    if(!session)continue;
    participating++;
    for(const row of session.entries){
      const note=present.get(row.id);
      if(!note){unavailable++;continue;}
      works.add(note.workId);
      if(row.state==='pending')pending++;
      else if(row.state==='revisit')revisit++;
      else reviewed++;
    }
  }
  return {pending,revisit,reviewed,books:works.size,
    collections:participating,unavailable};
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
  const byId=new Map(notes.map(note=>[note.id,note]));
  const selected=collections.filter(collection=>
    collectionId==='all'||collection.id===collectionId);
  let entries=0,missing=0,groups=0;
  const content:string[]=[];
  // This traverses every bounded session entry, not the 90-card UI window.
  for(const collection of selected){
    const session=readResearchSession(collection.id);
    if(!session)continue;
    const matching=session.entries.filter(row=>filter==='all'||row.state===filter);
    if(!matching.length)continue;
    groups++;
    content.push('## '+collection.name.replace(/[\r\n#]+/g,' ').trim(),'',
      '- Stable collection ID: '+collection.id,
      '- Session started: '+session.startedAt,
      '- Session updated: '+session.updatedAt,
      '- Entries for selected filter: '+matching.length,'');
    for(const row of matching){
      entries++;
      const note=byId.get(row.id);
      const check=row.state==='reviewed'?'- [x] ':'- [ ] ';
      if(!note){
        missing++;
        content.push(check+'Unavailable local source · '+row.state
          +' · note:'+row.id,
          '  - No original text, book identity, or revision was inferred.','');
        continue;
      }
      content.push(
        check+workTitle(note.workId)+' — '
          +note.title.replace(/[\r\n]/g,' ').trim()
          +' · '+row.state+' · note:'+note.id,
        '  - Work ID: '+note.workId
          +' · revision: '+note.revision
          +' · updated: '+note.updatedAt,
        '  - Recorded source: '
          +describeResearchSource(note.anchor,note.chapterKey)
            .replace(/[\r\n]/g,' '),
      );
    }
    content.push('');
  }
  const rows=[
    '# Cross-book research review','',
    '> THIEPN Library · portable temporary, self-reported review checklist.',
    '> No source-note prose, mastery credit, assessment, V2 backup or signature is included.',
    '> Unavailable references are listed explicitly rather than silently discarded.','',
    '- Entries exported: '+entries,
    '- Included collections: '+groups,
    '- Unavailable local note references: '+missing,
    '- Selected collection: '+(collectionId==='all'?'All collections':collectionId),
    '- Review filter: '+filter,'',
    ...content,
  ];
  if(!groups)rows.push('_No review entries match the selected filters._','');
  return rows.join('\n');
}
