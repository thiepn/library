import { extractNotebookLinks } from './note-links';
import { extractNotebookTopics } from './note-workspace';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import type { ResearchCollection } from './note-research';

const normalize=(v:string)=>v.normalize('NFKC').toLocaleLowerCase().trim();
const tokens=(v:string):string[]=>
  normalize(v).match(/[\p{L}\p{N}]{2,}/gu)?.slice(0,16)??[];
export interface ResearchSearchIndexEntry {
  note:BookNoteDocumentV1;
  title:string;
  book:string;
  chapter:string;
  topics:string[];
  excerpt:string;
  links:string[];
}
export interface ResearchCandidate {
  note:BookNoteDocumentV1;
  score:number;
  reasons:string[];
}
export function indexResearchNotes(
  notes:readonly BookNoteDocumentV1[],name:(workId:string)=>string,
):ResearchSearchIndexEntry[] {
  return notes.map(note=>({
    note,
    title:normalize(notebookTitle(note)),
    book:normalize(name(note.workId)),
    chapter:normalize(note.chapterKey??''),
    topics:extractNotebookTopics(note.bodyMarkdown),
    excerpt:normalize(note.bodyMarkdown.slice(0,12000)),
    links:extractNotebookLinks(note.bodyMarkdown).map(link=>link.id),
  }));
}
/** Token AND search, ranked by saved title, topic, chapter and book before body. */
export function searchResearchIndex(
  index:readonly ResearchSearchIndexEntry[],query:string,exclude:ReadonlySet<string>,
  book='all',limit=24,
):ResearchCandidate[] {
  const terms=tokens(query);
  const eligible=index.filter(item=>
    !exclude.has(item.note.id) && (book==='all'||item.note.workId===book));
  const matches=eligible.flatMap(item=>{
    if(!terms.every(term=>[item.title,item.book,item.chapter,...item.topics,item.excerpt]
      .some(value=>value.includes(term))))return [];
    const score=terms.reduce((sum,term)=>sum
      +(item.title.includes(term)?10:0)
      +(item.topics.some(t=>t.includes(term))?8:0)
      +(item.chapter.includes(term)?5:0)
      +(item.book.includes(term)?4:0)
      +(item.excerpt.includes(term)?1:0),0);
    return [{note:item.note,score,reasons:[]}];
  });
  return matches.sort((a,b)=>b.score-a.score
    ||b.note.updatedAt.localeCompare(a.note.updatedAt))
    .slice(0,Math.max(1,Math.min(80,limit)));
}
/**
 * Suggestions are traceable: an explicit authored note reference, reciprocal
 * backlink, or shared #topic marker. No speculative LLM associations.
 */
export function suggestedResearchSources(
  collection:ResearchCollection,index:readonly ResearchSearchIndexEntry[],
  limit=12,
):ResearchCandidate[] {
  const selected=new Set(collection.noteIds);
  const notes=index.filter(item=>selected.has(item.note.id));
  if(!notes.length)return [];
  const topics=new Set(notes.flatMap(item=>item.topics));
  const linked=new Set(notes.flatMap(item=>item.links));
  const scored=index.flatMap(item=>{
    if(selected.has(item.note.id))return [];
    const reasons:string[]=[];
    let score=0;
    if(linked.has(item.note.id)){
      reasons.push('Referenced by a collected note');score+=12;
    }
    if(item.links.some(id=>selected.has(id))){
      reasons.push('Links to a collected note');score+=10;
    }
    const shared=item.topics.filter(t=>topics.has(t));
    if(shared.length){
      reasons.push('Shared topics: '+shared.slice(0,3).map(t=>'#'+t).join(', '));
      score+=shared.length*5;
    }
    return score?[{note:item.note,score,reasons}]:[];
  });
  return scored.sort((a,b)=>b.score-a.score||b.note.updatedAt.localeCompare(a.note.updatedAt))
    .slice(0,Math.max(1,Math.min(24,limit)));
}
export function researchBookFacets(index:readonly ResearchSearchIndexEntry[]):Array<{workId:string;count:number}> {
  const map=new Map<string,number>();
  for(const item of index)map.set(item.note.workId,(map.get(item.note.workId)??0)+1);
  return [...map].map(([workId,count])=>({workId,count}))
    .sort((a,b)=>b.count-a.count||a.workId.localeCompare(b.workId));
}
