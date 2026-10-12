import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { describeResearchSource, type ResearchSource } from './note-research';

export interface ResearchReference {
  id:string;
  label:string;
  bookTitle:string;
  noteTitle:string;
  format:string;
  location:string;
  edition?:number;
  releaseVersion?:string;
  updatedAt:string;
  noteHref?:string;
  readerHref?:string;
}
export function researchReferences(sources:readonly ResearchSource[]):ResearchReference[] {
  return sources.map((source,index)=>{
    const {note,bookTitle,sourceHref}=source;
    const anchor=note.anchor;
    return {
      id:note.id,
      label:'R'+(index+1),
      bookTitle,
      noteTitle:notebookTitle(note),
      format:anchor?.format??'book',
      location:describeResearchSource(anchor,note.chapterKey),
      ...(anchor && anchor.format!=='web'
        ? {edition:anchor.edition,releaseVersion:anchor.releaseVersion}:{}),
      updatedAt:note.updatedAt,
      ...(sourceHref?{readerHref:sourceHref}:{}),
    };
  });
}
function singleLine(s:string):string {
  return s.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
}
/** Source-qualified rather than fabricated author/date/page citations. */
export function formatResearchCitation(ref:ResearchReference):string {
  const edition=ref.edition===undefined?'':' · edition '+ref.edition;
  const release=ref.releaseVersion?' · release '+singleLine(ref.releaseVersion):'';
  return '['+ref.label+'] '+singleLine(ref.bookTitle)+
    ' — '+singleLine(ref.noteTitle)+
    ' ('+singleLine(ref.location)+edition+release+').'+
    ' Note ID: '+ref.id+'.';
}
export function researchBibliographyMarkdown(references:readonly ResearchReference[]):string {
  if(!references.length)return '## Source notes\n\n_No available source notes._\n';
  return '# Research source notes\n\n'
    +references.map(ref=>'- '+formatResearchCitation(ref)
      +(ref.readerHref?' [Open reader]('+ref.readerHref+')':'')).join('\n')+'\n';
}
export function researchCitationMarkdown(ref:ResearchReference):string {
  // Link to stable note ID while retaining readable source label.
  const label=(ref.bookTitle+' · '+ref.noteTitle).replace(/[|\]\r\n]/g,' ').slice(0,160);
  return '['+ref.label+'] [[note:'+ref.id+'|'+label+']] — '+singleLine(ref.location);
}
export function sourceReferenceSummary(note:BookNoteDocumentV1,bookTitle:string):string {
  return bookTitle+' / '+notebookTitle(note)+' — '
    +describeResearchSource(note.anchor,note.chapterKey);
}
