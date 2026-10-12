import { extractNotebookLinks } from './note-links';
import { extractNotebookTopics } from './note-workspace';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { describeResearchSource, type ResearchCollection } from './note-research';

export interface NotebookCollectionMembership {
  id:string;
  name:string;
  source:boolean;
  synthesis:boolean;
  sourceCount:number;
}
export interface NotebookNavigatorResult {
  selected:BookNoteDocumentV1;
  memberships:NotebookCollectionMembership[];
  outbound:BookNoteDocumentV1[];
  inbound:BookNoteDocumentV1[];
  sharedTopicNotes:Array<{note:BookNoteDocumentV1;topics:string[]}>;
  sourceLabel:string;
  availableCollections:NotebookCollectionMembership[];
}
/**
 * All navigation derives only from saved local note IDs, explicit authored
 * [[note:...]] references and explicit #topic/... markers.
 * Membership never implies semantic agreement or verified source claims.
 */
export function buildNotebookNavigator(
  target:BookNoteDocumentV1,
  notes:readonly BookNoteDocumentV1[],
  collections:readonly ResearchCollection[],
  limit=10,
):NotebookNavigatorResult {
  const byId=new Map(notes.map(note=>[note.id,note]));
  const allLinks=extractNotebookLinks(target.bodyMarkdown).map(link=>link.id);
  const outbound=[...new Set(allLinks)].flatMap(id=>{
    const note=byId.get(id);
    return note&&note.id!==target.id?[note]:[];
  });
  const inbound=notes.filter(note=>note.id!==target.id
    &&extractNotebookLinks(note.bodyMarkdown).some(link=>link.id===target.id))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const existing=extractNotebookTopics(target.bodyMarkdown);
  const topics=new Set(existing);
  const sharedTopicNotes=topics.size?notes.filter(note=>note.id!==target.id)
    .flatMap(note=>{
      const shared=extractNotebookTopics(note.bodyMarkdown).filter(topic=>topics.has(topic));
      return shared.length?[{note,topics:shared}]:[];
    }).sort((a,b)=>b.topics.length-a.topics.length
      ||b.note.updatedAt.localeCompare(a.note.updatedAt))
    .slice(0,Math.max(1,Math.min(30,limit))):[];
  const memberships=collections.filter(collection=>collection.noteIds.includes(target.id)
    ||collection.synthesisId===target.id).map(collection=>({
      id:collection.id,name:collection.name,
      source:collection.noteIds.includes(target.id),
      synthesis:collection.synthesisId===target.id,
      sourceCount:collection.noteIds.length,
    }));
  const assigned=new Set(memberships.map(c=>c.id));
  const availableCollections=collections.filter(collection=>!assigned.has(collection.id))
    .map(collection=>({
      id:collection.id,name:collection.name,source:false,synthesis:false,
      sourceCount:collection.noteIds.length,
    }));
  return {
    selected:target,memberships,outbound:outbound.slice(0,30),
    inbound:inbound.slice(0,30),sharedTopicNotes,
    sourceLabel:describeResearchSource(target.anchor,target.chapterKey),
    availableCollections,
  };
}

export interface NavigatorSearchResult {
  note:BookNoteDocumentV1;
  reason:'linked'|'same-topic'|'same-book'|'recent';
  label:string;
}
export function notebookQuickConnections(
  result:NotebookNavigatorResult,
  notes:readonly BookNoteDocumentV1[],
  max=15,
):NavigatorSearchResult[] {
  const found=new Set<string>([result.selected.id]);
  const output:NavigatorSearchResult[]=[];
  const add=(note:BookNoteDocumentV1,reason:NavigatorSearchResult['reason'],label:string)=>{
    if(found.has(note.id))return;
    found.add(note.id);output.push({note,reason,label});
  };
  for(const note of result.outbound)add(note,'linked','Referenced in this note');
  for(const note of result.inbound)add(note,'linked','Links back to this note');
  for(const entry of result.sharedTopicNotes)
    add(entry.note,'same-topic','Shared topic: '+entry.topics.map(t=>'#'+t).join(', '));
  for(const note of notes.filter(n=>n.workId===result.selected.workId)
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
    add(note,'same-book','Same book');
  for(const note of [...notes].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
    add(note,'recent','Recently edited');
  return output.slice(0,Math.max(1,Math.min(30,max)));
}
export function referenceForNotebookWriting(note:BookNoteDocumentV1):string {
  const label=notebookTitle(note).replace(/[|\]\r\n]+/g,' ').trim().slice(0,150);
  return '[[note:'+note.id+'|'+label+']]';
}
