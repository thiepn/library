import { normalizeNotebookTopic } from './note-workspace';

export interface NotebookHeading {
  title: string;
  level: number;
  offset: number;
  line: number;
}
export function getNotebookHeadings(markdown: string): NotebookHeading[] {
  const entries: NotebookHeading[] = [];
  const lines=markdown.replace(/\r\n?/g,'\n').split('\n');
  let offset=0;
  let inFence=false;
  let fenceChar='';
  let fenceLength=0;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    const fence=line.match(/^\s*(\`{3,}|~{3,})/);
    if(fence) {
      const char=fence[1][0];
      if(!inFence){inFence=true;fenceChar=char;fenceLength=fence[1].length;}
      else if(char===fenceChar && fence[1].length>=fenceLength)inFence=false;
    } else if(!inFence) {
      const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if(heading)entries.push({
        title:heading[2],level:heading[1].length,
        offset:offset+line.indexOf(heading[1]),line:i+1,
      });
    }
    offset+=line.length+1;
  }
  return entries;
}
export interface TopicEditPreview {
  before: string;
  after: string;
  replacements: number;
}
/** Explicit markers only; never replace example text inside code blocks. */
export function rewriteNotebookTopic(
  markdown: string, source: string, replacement: string | null,
): TopicEditPreview {
  const oldTopic=normalizeNotebookTopic(source);
  const newTopic=replacement===null?null:normalizeNotebookTopic(replacement);
  if(!oldTopic || (replacement!==null && !newTopic))
    throw new Error('Use a topic name containing letters or numbers.');
  if(oldTopic===newTopic)return {before:markdown,after:markdown,replacements:0};
  const lines=markdown.split(/(\r?\n)/);
  let inFence=false, fenceChar='',fenceLength=0, count=0;
  const result=lines.map(line=>{
    if(line==='\n' || line==='\r\n')return line;
    const fence=line.match(/^\s*(\`{3,}|~{3,})/);
    if(fence) {
      const char=fence[1][0];
      if(!inFence){inFence=true;fenceChar=char;fenceLength=fence[1].length;}
      else if(char===fenceChar && fence[1].length>=fenceLength)inFence=false;
      return line;
    }
    if(inFence)return line;
    // Inline code spans remain unchanged.
    return line.split(/(\`[^\`\r\n]*\`)/g).map(piece=>{
      if(piece.startsWith('\`') && piece.endsWith('\`'))return piece;
      return piece.replace(/(^|[\s([{;,])#topic\/([\p{L}\p{N}-]+)(?=$|[\s)\]},.!?;:])/gu,
        (whole, boundary: string, candidate: string) => {
          if(normalizeNotebookTopic(candidate)!==oldTopic)return whole;
          count++;
          return boundary + (newTopic ? '#topic/'+newTopic : '');
        });
    }).join('');
  }).join('');
  return {before:markdown,after:result,replacements:count};
}
