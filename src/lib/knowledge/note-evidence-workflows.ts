import { extractNotebookLinks, noteReferenceMarkdown } from './note-links';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { describeResearchSource, type ResearchCollection } from './note-research';
import { extractNotebookTopics } from './note-workspace';

/** Read-only plans using saved user-authored notes, not book prose or graded evidence. */
export interface ResearchEvidence {
  id:string;
  note:BookNoteDocumentV1;
  book:string;
  location:string;
  topicNames:string[];
  excerpts:string[];
}
export interface ResearchCitationCoverage {
  source:ResearchEvidence;
  linked:boolean;
}
export interface ResearchEvidenceAudit {
  covered:ResearchCitationCoverage[];
  outOfCollection:BookNoteDocumentV1[];
  unavailableIds:string[];
  unreferenced:ResearchEvidence[];
  sourceCount:number;
}
const clean=(value:string)=>value.normalize('NFKC').replace(/[\r\n\t]+/g,' ')
  .replace(/\s+/g,' ').trim();
const fenced=/^\s*(?:\x60{3,}|~{3,})/;
const stripList=(value:string)=>value.replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/,'')
  .replace(/^\s*[-*]\s+\[(?:x| )\]\s+/i,'').trim();
export function noteEvidenceExcerpts(markdown:string,limit=14):string[] {
  const rows=markdown.split(/\r?\n/);
  let inFence=false;
  const samples:string[]=[];
  for(const row of rows){
    if(fenced.test(row)){inFence=!inFence;continue;}
    if(inFence||!row.trim()||row.trim().startsWith('#topic/'))continue;
    const excerpt=clean(stripList(row)).slice(0,420);
    if(excerpt.length<16 || /^[-|:\s]+$/.test(excerpt))continue;
    if(/^\[\[note:/.test(excerpt))continue;
    if(!samples.includes(excerpt))samples.push(excerpt);
    if(samples.length>=Math.max(1,Math.min(30,limit)))break;
  }
  return samples;
}
export function collectResearchEvidence(
  collection:ResearchCollection,
  notes:readonly BookNoteDocumentV1[],
  name:(workId:string)=>string,
):{sources:ResearchEvidence[];missingIds:string[]} {
  const byId=new Map(notes.map(note=>[note.id,note]));
  const sources:ResearchEvidence[]=[];
  const missingIds:string[]=[];
  for(const id of collection.noteIds){
    const note=byId.get(id);
    if(!note){missingIds.push(id);continue;}
    sources.push({
      id,note,book:name(note.workId),
      location:describeResearchSource(note.anchor,note.chapterKey),
      topicNames:extractNotebookTopics(note.bodyMarkdown),
      excerpts:noteEvidenceExcerpts(note.bodyMarkdown),
    });
  }
  return {sources,missingIds};
}
export function auditResearchCitations(
  collection:ResearchCollection,
  notes:readonly BookNoteDocumentV1[],
  synthesis:string,
  name:(workId:string)=>string,
):ResearchEvidenceAudit {
  const {sources,missingIds}=collectResearchEvidence(collection,notes,name);
  const requested=new Set(extractNotebookLinks(synthesis).map(link=>link.id));
  const sourceIds=new Set(collection.noteIds);
  const available=new Map(notes.map(note=>[note.id,note]));
  const outOfCollection:BookNoteDocumentV1[]=[];
  const unavailableIds:string[]=[...missingIds];
  for(const id of requested){
    if(sourceIds.has(id))continue;
    const document=available.get(id);
    if(document)outOfCollection.push(document);
    else unavailableIds.push(id);
  }
  const covered=sources.map(source=>({source,linked:requested.has(source.id)}));
  return {
    covered,outOfCollection,unavailableIds:[...new Set(unavailableIds)],
    unreferenced:sources.filter(source=>!requested.has(source.id)),
    sourceCount:collection.noteIds.length,
  };
}
function mdSafe(value:string):string{return clean(value).replace(/[|]/g,'/');}
export function evidenceToSynthesis(
  evidence:ResearchEvidence,
  excerpt?:string,
  context='Observation to assess',
):string {
  const sections=[
    '### '+mdSafe(context),'',
    '**Source note:** '+noteReferenceMarkdown(evidence.note),
    '**Book:** '+mdSafe(evidence.book),
    '**Recorded location:** '+mdSafe(evidence.location),'',
  ];
  if(excerpt)sections.push('> From my saved notebook note: '+mdSafe(excerpt),'');
  sections.push('**What this supports / limitations:**','','','');
  return sections.join('\n');
}
export function evidenceReviewMarkdown(
  collection:ResearchCollection,
  audit:ResearchEvidenceAudit,
  savedSynthesis?:BookNoteDocumentV1,
):string {
  const rows=[
    '# Evidence review — '+mdSafe(collection.name),'',
    '> THIEPN Library · derived from locally saved note documents and explicit note links.',
    '> Excerpts are learner-authored notes, not verified quotations from books.',
    '> Coverage identifies whether a note is linked, not whether a claim is correct.','',
    '- Sources in collection: '+audit.sourceCount,
    '- Available: '+audit.covered.length,
    '- Linked in '+(savedSynthesis?'saved synthesis':'draft review')+': '
      +audit.covered.filter(item=>item.linked).length,
    '- Available but unlinked: '+audit.unreferenced.length,
    '- Missing references: '+audit.unavailableIds.length,'',
    '## Source ledger','',
  ];
  for(const row of audit.covered){
    const {source}=row;
    rows.push('### '+mdSafe(source.book)+' — '+mdSafe(notebookTitle(source.note)),'',
      '- Note ID: '+source.id,
      '- Location: '+mdSafe(source.location),
      '- Explicitly linked: '+(row.linked?'Yes':'No'),
      '- Topics: '+(source.topicNames.join(', ')||'none'),'');
  }
  if(audit.outOfCollection.length){
    rows.push('## Referenced outside this collection','',
      ...audit.outOfCollection.map(note=>'- '+mdSafe(notebookTitle(note))+' · note:'+note.id),'');
  }
  if(audit.unavailableIds.length){
    rows.push('## Missing local note IDs','',
      ...audit.unavailableIds.map(id=>'- '+id),'');
  }
  rows.push('## Review questions','',
    '1. Which claims still need support from saved notes?',
    '2. Which cited notes actually support each claim, rather than merely mention the topic?',
    '3. What counterevidence or limitations remain?',
    '4. Are publication details missing that must be verified directly from the source?','');
  return rows.join('\n');
}
