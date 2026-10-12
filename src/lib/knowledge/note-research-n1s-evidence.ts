import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { extractNotebookLinks, noteReferenceMarkdown } from './note-links';
import { extractNotebookTopics } from './note-workspace';
import { researchSynthesisSections } from './note-research-n1r-sections';
import { describeResearchSource, type ResearchCollection } from './note-research';

/**
 * Local read-only suggestions, never evidence validation or relevance claims.
 * Connections must come from explicit #topic markers or author-created note links,
 * with weaker exact title tokens used only for discoverability.
 */
export interface SectionEvidenceSuggestion {
  note:BookNoteDocumentV1;
  relation:string[];
  inCollection:boolean;
  score:number;
}
export interface SectionEvidenceContext {
  sectionIndex:number;
  title:string;
  noteIds:string[];
  unavailableIds:string[];
  outsideCollectionIds:string[];
  inCollectionIds:string[];
  uncitedCollectionIds:string[];
  suggestions:SectionEvidenceSuggestion[];
}
const words=(value:string)=>new Set((value.normalize('NFKC').toLocaleLowerCase()
  .match(/[\p{L}\p{N}]{4,}/gu)??[]).filter(term=>![
    'with','from','that','this','have','been','the','and','notes','note',
    'quelle','what','source','chapter','section','eine','einem','einen',
    'einer','nicht','auch','oder','und','über','durch','book','claim',
  ].includes(term)));
export function getSectionEvidenceContext(
  markdown:string,index:number,collection:ResearchCollection,
  notes:readonly BookNoteDocumentV1[],limit=12,
):SectionEvidenceContext|undefined {
  const section=researchSynthesisSections(markdown)[index];
  if(!section)return undefined;
  const byId=new Map(notes.map(note=>[note.id,note]));
  const collectionIds=new Set(collection.noteIds);
  const noteIds=[...new Set(section.sourceIds)];
  const unavailableIds=noteIds.filter(id=>!byId.has(id));
  const outsideCollectionIds=noteIds.filter(id=>byId.has(id)&&!collectionIds.has(id));
  const inCollectionIds=noteIds.filter(id=>collectionIds.has(id)&&byId.has(id));
  const uncitedCollectionIds=collection.noteIds.filter(id=>byId.has(id)&&!noteIds.includes(id));
  const used=inCollectionIds.map(id=>byId.get(id)!);
  const authoredSectionTopics=new Set(extractNotebookTopics(
    markdown.slice(section.start,section.end),
  ));
  const topicSet=new Set(used.flatMap(note=>extractNotebookTopics(note.bodyMarkdown)));
  const explicitLinks=new Set(used.flatMap(note=>extractNotebookLinks(note.bodyMarkdown).map(link=>link.id)));
  const headingTerms=words(section.title);
  const suggestions:SectionEvidenceSuggestion[]=[];
  for(const note of notes){
    if(noteIds.includes(note.id)||note.id===collection.synthesisId)continue;
    const reasons:string[]=[];
    let score=0;
    const noteTopics=extractNotebookTopics(note.bodyMarkdown);
    const directTopics=noteTopics.filter(topic=>authoredSectionTopics.has(topic));
    if(directTopics.length){
      score+=directTopics.length*10;
      reasons.push('Topic marked in this section: '+directTopics.slice(0,3)
        .map(t=>'#topic/'+t).join(', '));
    }
    const shared=noteTopics.filter(topic=>topicSet.has(topic)&&!authoredSectionTopics.has(topic));
    if(shared.length){score+=shared.length*6;reasons.push('Shared explicit cited-note topics: '+shared.slice(0,3).map(t=>'#topic/'+t).join(', '));}
    if(explicitLinks.has(note.id)){
      score+=9;reasons.push('Linked by a cited note');
    }
    if(used.some(source=>extractNotebookLinks(note.bodyMarkdown).some(link=>link.id===source.id))){
      score+=8;reasons.push('Links to a cited note');
    }
    const matched=[...headingTerms].filter(term=>words(notebookTitle(note)).has(term));
    if(matched.length){
      score+=matched.length*2;
      reasons.push('Heading/title terms: '+matched.slice(0,4).join(', '));
    }
    if(score===0)continue;
    suggestions.push({note,relation:reasons,
      inCollection:collectionIds.has(note.id),score});
  }
  suggestions.sort((a,b)=>b.score-a.score
    ||Number(b.inCollection)-Number(a.inCollection)
    ||b.note.updatedAt.localeCompare(a.note.updatedAt));
  return {
    sectionIndex:index,title:section.title,noteIds,unavailableIds,
    outsideCollectionIds,inCollectionIds,uncitedCollectionIds,
    suggestions:suggestions.slice(0,Math.max(1,Math.min(limit,30))),
  };
}
export function sectionEvidenceReviewMarkdown(
  context:SectionEvidenceContext,
  collection:ResearchCollection,
  notes:readonly BookNoteDocumentV1[],
  bookTitle:(workId:string)=>string,
  sourceHref?:(note:BookNoteDocumentV1)=>string|undefined,
):string {
  const byId=new Map(notes.map(note=>[note.id,note]));
  const rows=[
    '# Section evidence worksheet — '+context.title.replace(/[\r\n#]/g,' ').trim(),'',
    '> Manually exported local research worksheet, not an authoritative saved note.',
    '> Suggestions are based on explicit note links, #topic tags and matching title words.',
    '> Source links indicate provenance, not verified quotations or conclusions.','',
    '- Collection: '+collection.name+' (ID '+collection.id+')',
    '- Linked local collection sources: '+context.inCollectionIds.length,
    '- Linked outside this collection: '+context.outsideCollectionIds.length,
    '- Unavailable linked note IDs: '+context.unavailableIds.length,
    '- Other collected sources to consider: '+context.uncitedCollectionIds.length,'',
    '## Cited notes','',
  ];
  for(const id of context.noteIds){
    const note=byId.get(id);
    rows.push(note?'- '+bookTitle(note.workId)+' — '+notebookTitle(note)
      +' · '+noteReferenceMarkdown(note)+' · revision '+note.revision
      +' · recorded location '+describeResearchSource(note.anchor,note.chapterKey)
      +(context.outsideCollectionIds.includes(id)?' · outside selected collection':'')
      :'- Unavailable local source: note:'+id);
  }
  if(!context.noteIds.length)rows.push('_No authored note citations in this section._');
  rows.push('','## Candidates to evaluate (not evidence judgments)','');
  for(const item of context.suggestions){
    rows.push('- '+bookTitle(item.note.workId)+' — '+notebookTitle(item.note)
      +' · '+noteReferenceMarkdown(item.note)
      +' · '+(item.inCollection?'already collected':'not in selected collection'),
      '  - Recorded location: '+describeResearchSource(item.note.anchor,item.note.chapterKey),
      '  - Why surfaced: '+item.relation.join('; '));
    const href=sourceHref?.(item.note);
    if(href)rows.push('  - Reader navigation: '+href.replace(/[\r\n]/g,' '));
  }
  if(!context.suggestions.length)rows.push('_No note-link, topic or title-term connections found._');
  rows.push('','## Writing review','',
    '- [ ] Confirm each citation actually supports the claim in this section',
    '- [ ] Reopen relevant original book locations to check context',
    '- [ ] Consider contradictory and missing evidence',
    '- [ ] Decide explicitly which suggestions to collect or cite','','');
  return rows.join('\n');
}
