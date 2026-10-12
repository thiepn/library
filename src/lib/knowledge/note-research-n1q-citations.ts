import { noteReferenceMarkdown } from './note-links';
import type { BookNoteDocumentV1 } from './note-model';

export interface ResearchCitationLocation {
  id:string;
  start:number;
  end:number;
}
/**
 * Source links inside authored Markdown only. The offset-preserving readable
 * mask ignores fenced/inline code, matching the existing note-link contract.
 * It does not infer whether a cited note actually proves an argument.
 */
export function researchCitationLocations(markdown:string):ResearchCitationLocation[] {
  const masked=markdown
    .replace(/(^|\n)[ \t]*`{3,}[^\n]*\n[\s\S]*?\n[ \t]*`{3,}[^\n]*(?=\n|$)/g,
      match=>match.replace(/[^\n]/g,' '))
    .replace(/`[^\x60\r\n]*`/g,match=>' '.repeat(match.length));
  return [...masked.matchAll(/\[\[note:([A-Za-z0-9_-]{1,180})(?:\|[^\]\r\n]{1,200})?\]\]/g)]
    .map(match=>({id:match[1],start:match.index??0,
      end:(match.index??0)+match[0].length}));
}
export function citationCountForNote(
  all:readonly ResearchCitationLocation[],id:string,
):number {return all.filter(item=>item.id===id).length;}
export function nextResearchCitation(
  all:readonly ResearchCitationLocation[],id:string,position:number,
):ResearchCitationLocation|undefined {
  const matching=all.filter(item=>item.id===id).sort((a,b)=>a.start-b.start);
  return matching.find(item=>item.start>=position)??matching[0];
}
export function insertResearchNoteLink(
  text:string,from:number,to:number,note:BookNoteDocumentV1,maxLength=250000,
):{body:string;cursor:number} {
  const start=Math.min(text.length,Math.max(0,from));
  const end=Math.min(text.length,Math.max(start,to));
  const addition=noteReferenceMarkdown(note);
  const body=text.slice(0,start)+addition+text.slice(end);
  if(body.length>maxLength)throw new Error('Synthesis note has reached its text limit.');
  return {body,cursor:start+addition.length};
}
