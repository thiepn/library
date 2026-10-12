import { getNotebookHeadings } from './note-outline';
import { researchCitationLocations } from './note-research-n1q-citations';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { noteReferenceMarkdown } from './note-links';
import { describeResearchSource } from './note-research';

/**
 * Markdown headings and authored stable-ID links remain the only source of
 * section identity. No independent outline writer, metadata table or grading.
 */
export interface SynthesisSection {
  index:number;
  level:number;
  title:string;
  start:number;
  end:number;
  parent:number|null;
  sourceIds:string[];
}
export type SynthesisSectionTemplate='claim'|'counter'|'comparison'|'question'|'reading';
export function researchSynthesisSections(body:string):SynthesisSection[] {
  const headings=getNotebookHeadings(body);
  const sections:SynthesisSection[]=[];
  const ancestors:number[]=[];
  const references=researchCitationLocations(body);
  for(const [index,heading] of headings.entries()){
    while(ancestors.length&&headings[ancestors[ancestors.length-1]].level>=heading.level)
      ancestors.pop();
    const parent=ancestors.length?ancestors[ancestors.length-1]:null;
    const next=headings.slice(index+1).find(candidate=>candidate.level<=heading.level);
    const end=next?.offset??body.length;
    sections.push({
      index,level:heading.level,title:heading.title,start:heading.offset,end,parent,
      sourceIds:[...new Set(references.filter(ref=>ref.start>=heading.offset&&ref.end<=end)
        .map(ref=>ref.id))],
    });
    ancestors.push(index);
  }
  return sections;
}
export function moveSynthesisSection(
  body:string,sectionIndex:number,direction:-1|1,
):{body:string;caret:number}|undefined {
  const sections=researchSynthesisSections(body);
  const section=sections[sectionIndex];
  if(!section)return undefined;
  const siblings=sections.filter(other=>other.parent===section.parent&&other.level===section.level);
  const current=siblings.findIndex(other=>other.index===section.index);
  const next=siblings[current+direction];
  if(!next)return undefined;
  if(direction===1){
    const left=body.slice(section.start,next.start);
    const right=body.slice(next.start,next.end);
    return {
      body:body.slice(0,section.start)+right+left+body.slice(next.end),
      caret:section.start+right.length,
    };
  }
  const left=body.slice(next.start,section.start);
  const right=body.slice(section.start,section.end);
  return {
    body:body.slice(0,next.start)+right+left+body.slice(section.end),
    caret:next.start,
  };
}
export function synthesisSectionTemplate(
  template:SynthesisSectionTemplate,
  source?:BookNoteDocumentV1,
):string {
  const link=source?noteReferenceMarkdown(source):'_Choose a saved note reference_';
  const sections:Record<SynthesisSectionTemplate,string>={
    claim:'### Claim and evidence\n\n**Claim in my words:**\n\n'
      +'**Supporting note:** '+link+'\n\n'
      +'**Reasoning and limitations:**\n\n'
      +'**What still needs confirmation in the original book:**\n\n',
    counter:'### Alternative interpretation\n\n**Counterargument:**\n\n'
      +'**Source to consult:** '+link+'\n\n'
      +'**My response, including uncertainty:**\n\n',
    comparison:'### Compare two accounts\n\n**First note:** '+link+'\n\n'
      +'**Second note:** _Add another note citation_\n\n'
      +'**Agreements:**\n\n**Differences:**\n\n**Next reading:**\n\n',
    question:'### Open research question\n\n**Question:**\n\n'
      +'**Initial note:** '+link+'\n\n'
      +'**Potential evidence or counterexample:**\n\n',
    reading:'### Reading takeaway\n\n**Source:** '+link+'\n\n'
      +'**Observation in my words:**\n\n'
      +'**How it affects the overall synthesis:**\n\n',
  };
  return sections[template];
}
export function insertSynthesisSection(
  body:string,sectionIndex:number,template:string,maxLength=250000,
):{body:string;caret:number} {
  const section=researchSynthesisSections(body)[sectionIndex];
  const offset=section?.end??body.length;
  const before=body.slice(0,offset),after=body.slice(offset);
  const prefix=before.length&&!before.endsWith('\n')?'\n\n':'\n';
  const suffix=after.length&&!after.startsWith('\n')?'\n':'';
  const addition=prefix+template.trimEnd()+'\n'+suffix;
  const next=before+addition+after;
  if(next.length>maxLength)throw new Error('Synthesis exceeds the native note text limit.');
  return {body:next,caret:offset+addition.length};
}
export function sectionWritingPacketMarkdown(
  body:string,index:number,notes:readonly BookNoteDocumentV1[],
  bookTitle:(workId:string)=>string,
  options?:{savedRevision?:number;collectionName?:string;dirty?:boolean},
):string {
  const section=researchSynthesisSections(body)[index];
  if(!section)throw new Error('Select a synthesis section first.');
  const lookup=new Map(notes.map(note=>[note.id,note]));
  const lines=[
    '# Section working copy — '+section.title.replace(/[\r\n#]/g,' ').trim(),
    '',
    '> This is a manually exported writing copy, not an authoritative saved Library note.',
    '> Citations point to authored notebook records; references do not certify underlying claims.',
    '> Original book quotations and publication details must be checked independently.',
    '',
    '- Collection: '+(options?.collectionName??'not specified'),
    '- Native synthesis base revision: '+(options?.savedRevision??'not created'),
    '- Current content: '+(options?.dirty?'unsaved writing draft':'current editor copy'),
    '- Section heading level: '+section.level,
    '- Cited saved-note IDs: '+section.sourceIds.length,
    '',
    '## Section Markdown',
    '',
    body.slice(section.start,section.end).trimEnd(),
    '',
    '## Source references',
    '',
  ];
  for(const id of section.sourceIds){
    const note=lookup.get(id);
    lines.push(note
      ?'- '+bookTitle(note.workId)+' — '+notebookTitle(note)
        +' · note:'+id+' · revision '+note.revision
        +' · updated '+note.updatedAt
        +' · recorded location: '+describeResearchSource(note.anchor,note.chapterKey)
          .replace(/[\r\n]/g,' ')
      :'- Unavailable local source note: '+id);
  }
  if(!section.sourceIds.length)
    lines.push('_No explicit saved-note links occur in this section._');
  lines.push('','## Evidence still to assess','','- [ ] Recheck referenced book passages',
    '- [ ] Separate observation from interpretation',
    '- [ ] Consider an alternative explanation','','');
  return lines.join('\n');
}
