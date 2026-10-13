import type { BookNoteDocumentV1 } from './note-model';
import { notebookTitle } from './note-model';
import { extractNotebookLinks, noteReferenceMarkdown } from './note-links';
import { extractNotebookTopics } from './note-workspace';
import { noteEvidenceExcerpts } from './note-evidence-workflows';
import { describeResearchSource, type ResearchCollection } from './note-research';
import { researchContinuityMarkdown } from './note-research-n1t-continuity';
import { readResearchSession } from './note-research-session';

/** All statements here describe notebook provenance or authored markers, never source truth. */
export interface RelatedResearchNote {
  note:BookNoteDocumentV1;
  reasons:string[];
  score:number;
}
export function relatedResearchNotes(
  source:BookNoteDocumentV1,
  notes:readonly BookNoteDocumentV1[],
  limit=12,
):RelatedResearchNote[] {
  const originalTopics=new Set(extractNotebookTopics(source.bodyMarkdown));
  const explicitOutgoing=new Set(extractNotebookLinks(source.bodyMarkdown).map(link=>link.id));
  return notes.filter(note=>note.id!==source.id).flatMap(note=>{
    const reasons:string[]=[];
    let score=0;
    if(explicitOutgoing.has(note.id)){
      reasons.push('Explicitly linked from this note');score+=10;
    }
    if(extractNotebookLinks(note.bodyMarkdown).some(link=>link.id===source.id)){
      reasons.push('This note links back to the source');score+=9;
    }
    const shared=extractNotebookTopics(note.bodyMarkdown).filter(topic=>originalTopics.has(topic));
    if(shared.length){
      reasons.push('Shared authored topics: '+shared.slice(0,4).map(topic=>'#topic/'+topic).join(', '));
      score+=shared.length*5;
    }
    return score?[{note,reasons,score}]:[];
  }).sort((a,b)=>b.score-a.score
    ||b.note.updatedAt.localeCompare(a.note.updatedAt)
    ||a.note.id.localeCompare(b.note.id))
    .slice(0,Math.max(1,Math.min(24,limit)));
}
export function sourceReadingCaptureMarkdown(
  source:BookNoteDocumentV1,
  title:(workId:string)=>string,
  reader?:(note:BookNoteDocumentV1)=>string|undefined,
):string {
  const observations=noteEvidenceExcerpts(source.bodyMarkdown,3);
  const lines=[
    '### Reading-to-synthesis follow-up','',
    '> Material below is derived from MY saved notebook note, not a verified quotation from the original work.',
    '**Notebook source:** '+noteReferenceMarkdown(source),
    '**Book:** '+title(source.workId).replace(/[\r\n]/g,' '),
    '**Recorded location:** '+describeResearchSource(source.anchor,source.chapterKey).replace(/[\r\n]/g,' '),
    '**Native note revision:** '+source.revision,
  ];
  const href=reader?.(source);
  if(href)lines.push('**Original reader:** '+href.replace(/[\r\n]/g,' '));
  if(observations.length){
    lines.push('','**My saved observations to reconsider:**');
    for(const excerpt of observations)
      lines.push('- '+excerpt.replace(/[\r\n]/g,' ').slice(0,300));
  }
  lines.push('','**How this contributes to my argument:**','','',
    '**What the original book actually supports (verify manually):**','','',
    '**Alternative interpretation or missing source:**','','');
  return lines.join('\n');
}
/** Source relationships are transparent authored metadata, not inferred agreement. */
export function researchComparisonConnections(sources:readonly BookNoteDocumentV1[]):string {
  const entries: string[]=[
    '### Authored note connections (navigation, not agreement)','',
    '> Shared topics and explicit note links are recorded below. They do not establish matching claims.','',
  ];
  let found=0;
  for(let i=0;i<sources.length;i++){
    for(let j=i+1;j<sources.length;j++){
      const left=sources[i],right=sources[j];
      const shared=extractNotebookTopics(left.bodyMarkdown)
        .filter(topic=>extractNotebookTopics(right.bodyMarkdown).includes(topic));
      const leftToRight=extractNotebookLinks(left.bodyMarkdown).some(link=>link.id===right.id);
      const rightToLeft=extractNotebookLinks(right.bodyMarkdown).some(link=>link.id===left.id);
      if(!shared.length&&!leftToRight&&!rightToLeft)continue;
      found++;
      entries.push('- '+noteReferenceMarkdown(left)+' ↔ '+noteReferenceMarkdown(right),
        ...(shared.length?['  - Shared explicit topics: '+shared.map(t=>'#topic/'+t).join(', ')]:[]),
        ...(leftToRight?['  - First note explicitly links to second']:[]),
        ...(rightToLeft?['  - Second note explicitly links to first']:[]),
        '');
    }
  }
  if(!found)entries.push('_No explicit #topic or authored direct-link connections were found among these sources._','');
  return entries.join('\n');
}
/**
 * Portable, current-draft working research packet. Does not pretend to be
 * the canonical saved-note export or Library V2 backup.
 */
export function currentResearchWorkingPacket(
  collection:ResearchCollection,
  draft:{title:string;body:string},
  savedRevision:number|undefined,
  unsaved:boolean,
  notes:readonly BookNoteDocumentV1[],
  title:(workId:string)=>string,
  reader:(note:BookNoteDocumentV1)=>string|undefined,
):string {
  const available=new Map(notes.map(note=>[note.id,note]));
  const missing=collection.noteIds.filter(id=>!available.has(id));
  const sources=collection.noteIds.flatMap(id=>{
    const note=available.get(id);
    return note?[note]:[];
  });
  const books=new Set(sources.map(note=>note.workId));
  const session=readResearchSession(collection.id);
  const rows=[
    '# Working research packet — '+collection.name.replace(/[\r\n#]/g,' ').trim(),'',
    '> Human-reviewable working copy, NOT a saved native note, encrypted/signed custody record or Library V2 backup.',
    '> Source excerpts are my notebook observations; citations and links do not verify book content.','',
    '- Collection ID: '+collection.id,
    '- Native synthesis ID: '+(collection.synthesisId??'none'),
    '- Base revision: '+(savedRevision??'none'),
    '- Editor changes: '+(unsaved?'UNSAVED; manual save still required':'no pending editor changes reported'),
    '- Collected source IDs: '+collection.noteIds.length,
    '- Available source notes: '+sources.length,
    '- Missing local note IDs: '+missing.length,
    '- Distinct source books: '+books.size,
    '- Review state: '+(session?'temporary tab-local, self-reported':'no tab session'),'',
    '## Current writing (not automatically committed)','',
    '# '+draft.title.replace(/[\r\n#]/g,' ').trim(),'',
    draft.body,'',
    '---','',
    researchContinuityMarkdown(collection,draft.body,savedRevision,notes,title,reader,unsaved),
    '','---','','## Collected source ledger','',
  ];
  for(const id of collection.noteIds){
    const note=available.get(id);
    if(!note){rows.push('- Unavailable local note ID: '+id);continue;}
    rows.push('- '+title(note.workId)+' — '+notebookTitle(note),
      '  - '+noteReferenceMarkdown(note)+' · native revision '+note.revision
        +' · updated '+note.updatedAt,
      '  - Recorded location: '+describeResearchSource(note.anchor,note.chapterKey).replace(/[\r\n]/g,' '));
    const href=reader(note);
    if(href)rows.push('  - Original reader: '+href.replace(/[\r\n]/g,' '));
  }
  if(session){
    rows.push('','## Tab-only research review checklist','',
      '> Review flags are self-reported, not mastery or graded assessment.','');
    for(const row of session.entries)
      rows.push('- '+row.state+' · note:'+row.id
        +(available.has(row.id)?'':' · unavailable locally'));
  }
  rows.push('','## Manual follow-up','',
    '- [ ] Save the native synthesis explicitly if the writing should persist',
    '- [ ] Restore unavailable note records only through the established Library V2 flow',
    '- [ ] Inspect original book context and conflicting interpretations',
    '- [ ] Recheck all links and revisions before sharing','','');
  return rows.join('\n');
}
