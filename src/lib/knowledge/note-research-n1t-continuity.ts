import type { BookNoteDocumentV1 } from './note-model';
import { notebookTitle } from './note-model';
import { noteReferenceMarkdown } from './note-links';
import { noteEvidenceExcerpts } from './note-evidence-workflows';
import { researchSynthesisSections, type SynthesisSection } from './note-research-n1r-sections';
import { getSectionEvidenceContext } from './note-research-n1s-evidence';
import { describeResearchSource, type ResearchCollection } from './note-research';

/**
 * A read-only agenda for learner-authored synthesis paragraphs. These are
 * citation/navigation gaps, NEVER judgments that a claim is true or false.
 */
export interface ResearchSectionGap {
  section:SynthesisSection;
  missingIds:string[];
  outsideIds:string[];
  collectedSourceIds:string[];
  gapReasons:string[];
}
export function researchSectionAgenda(
  markdown:string,collection:ResearchCollection,
  documents:readonly BookNoteDocumentV1[],
):ResearchSectionGap[] {
  const available=new Set(documents.map(note=>note.id));
  const collected=new Set(collection.noteIds);
  // One Markdown parse and one local lookup: large drafts need not rescore the
  // entire library for every heading, on each editor refresh or export.
  return researchSynthesisSections(markdown).map(section=>{
    const missingIds=section.sourceIds.filter(id=>!available.has(id));
    const outsideIds=section.sourceIds.filter(id=>available.has(id)&&!collected.has(id));
    const collectedSourceIds=section.sourceIds.filter(id=>available.has(id)&&collected.has(id));
    const gapReasons:string[]=[];
    if(!section.sourceIds.length)gapReasons.push('No explicit note links in this section');
    if(missingIds.length)gapReasons.push(missingIds.length+' unavailable saved-note references');
    if(outsideIds.length)gapReasons.push(outsideIds.length+' links outside this collection');
    return {
      section,missingIds,outsideIds,collectedSourceIds,
      gapReasons,
    };
  });
}
export function nextSectionGap(
  agenda:readonly ResearchSectionGap[],startIndex:number,
):ResearchSectionGap|undefined {
  const incomplete=agenda.filter(row=>row.gapReasons.length);
  return incomplete.find(row=>row.section.index>startIndex)
    ??incomplete[0];
}
export function appendReferenceInSection(
  body:string,sectionIndex:number,note:BookNoteDocumentV1,
  maxLength=250000,
):{body:string;cursor:number} {
  const section=researchSynthesisSections(body)[sectionIndex];
  if(!section)throw new Error('Select an existing synthesis heading first.');
  const reference=noteReferenceMarkdown(note);
  if(section.sourceIds.includes(note.id))
    throw new Error('This section already contains a citation to that saved note.');
  const before=body.slice(0,section.end),after=body.slice(section.end);
  const delimiter=before.endsWith('\n')?'\n':'\n\n';
  const addition=delimiter+'Source to evaluate: '+reference+'\n';
  const revised=before+addition+after;
  if(revised.length>maxLength)throw new Error('Native synthesis text limit reached.');
  return {body:revised,cursor:before.length+addition.length};
}
export function sourceComparisonForSection(
  left:BookNoteDocumentV1,right:BookNoteDocumentV1,
  bookTitle:(id:string)=>string,
  readerLink?:(note:BookNoteDocumentV1)=>string|undefined,
):string {
  if(left.id===right.id)throw new Error('Choose two different saved notes.');
  const lines=[
    '### Compare saved notes: '+notebookTitle(left)+' / '+notebookTitle(right),'',
    '> Source inventory is taken from my own locally saved notes, not from verified book quotations.',
    '> Similar wording does not establish agreement. Complete the comparison independently.','',
  ];
  for(const [index,note] of [left,right].entries()){
    const excerpts=noteEvidenceExcerpts(note.bodyMarkdown,2);
    lines.push('**Source '+(index===0?'A':'B')+':** '+noteReferenceMarkdown(note),
      '- Book: '+bookTitle(note.workId).replace(/[\r\n]/g,' '),
      '- Recorded location: '+describeResearchSource(note.anchor,note.chapterKey)
        .replace(/[\r\n]/g,' '),
      '- Saved note revision: '+note.revision,
      ...(readerLink?.(note)?[
        '- Original reader: '+readerLink(note)!.replace(/[\r\n]/g,' '),
      ]:[]),
      ...(excerpts.length?[
        '- My notebook observations to evaluate:',
        ...excerpts.map(value=>'  - '+value.replace(/[\r\n]/g,' ').slice(0,230)),
      ]:['- No prose excerpts available in this saved note.']),
      '');
  }
  lines.push(
    '**Shared question:**','','',
    '**Evidence for agreement (verify in originals):**','','',
    '**Differences or counterarguments:**','','',
    '**What neither saved note resolves:**','','',
    '**My provisional synthesis:**','','',
  );
  return lines.join('\n');
}
export function researchContinuityMarkdown(
  collection:ResearchCollection,markdown:string,
  savedRevision:number|undefined,
  notes:readonly BookNoteDocumentV1[],
  bookTitle:(id:string)=>string,
  readerLink:(note:BookNoteDocumentV1)=>string|undefined,
  unsaved:boolean,
):string {
  const agenda=researchSectionAgenda(markdown,collection,notes);
  const byId=new Map(notes.map(note=>[note.id,note]));
  const listed=new Set(agenda.flatMap(item=>item.section.sourceIds));
  const rows=[
    '# Research writing continuity — '+collection.name.replace(/[\r\n#]/g,' ').trim(),'',
    '> Working reader/writer navigation worksheet, not a native note, signed receipt or Library V2 backup.',
    '> A note citation is not proof that a claim is accurate or a book passage was checked.','',
    '- Collection ID: '+collection.id,
    '- Synthesis base revision: '+(savedRevision??'none'),
    '- Writing source: '+(unsaved?'current unsaved editor text':'current editor / saved revision'),
    '- Authored sections: '+agenda.length,
    '- Sections needing citation/navigation attention: '+agenda.filter(item=>item.gapReasons.length).length,
    '- Distinct explicitly cited note IDs: '+listed.size,'',
  ];
  for(const item of agenda){
    rows.push('## '+item.section.title.replace(/[\r\n#]/g,' ').trim(),'',
      '- Heading level: '+item.section.level,
      '- Source links in section: '+item.section.sourceIds.length,
      '- Navigation gaps: '+(item.gapReasons.join('; ')||'No explicit link gaps detected'),
      '');
    for(const id of item.section.sourceIds){
      const note=byId.get(id);
      if(!note){rows.push('- Missing local source ID: '+id);continue;}
      rows.push('- '+bookTitle(note.workId)+' — '+notebookTitle(note),
        '  - '+noteReferenceMarkdown(note)+' · revision '+note.revision,
        '  - Recorded location: '+describeResearchSource(note.anchor,note.chapterKey));
      const href=readerLink(note);
      if(href)rows.push('  - Open original reader: '+href.replace(/[\r\n]/g,' '));
    }
    if(!item.section.sourceIds.length)rows.push('_No authored note references._');
    if(item.gapReasons.length){
      const context=getSectionEvidenceContext(markdown,item.section.index,collection,notes,3);
      if(context?.suggestions.length){
        rows.push('','### Saved-note candidates to inspect (not verified evidence)','');
        for(const candidate of context.suggestions){
          rows.push('- '+bookTitle(candidate.note.workId)+' — '+notebookTitle(candidate.note)
            +' · '+noteReferenceMarkdown(candidate.note)
            +' · '+(candidate.inCollection?'collected':'outside collection'),
            '  - Grounded connection: '+candidate.relation.join('; '));
          const href=readerLink(candidate.note);
          if(href)rows.push('  - Reader: '+href.replace(/[\r\n]/g,' '));
        }
      }
    }
    rows.push('','- [ ] Check whether each cited note supports the actual claim',
      '- [ ] Revisit original reading context and consider counterevidence','');
  }
  if(!agenda.length)rows.push('_No Markdown headings yet. Add sections in the native synthesis editor._','');
  return rows.join('\n');
}
