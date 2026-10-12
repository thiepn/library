import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { noteReferenceMarkdown } from './note-links';
import { describeResearchSource } from './note-research';
import { extractNotebookTopics } from './note-workspace';
import { noteEvidenceExcerpts } from './note-evidence-workflows';

export interface ComparisonSource {
  note:BookNoteDocumentV1;
  bookTitle:string;
}
/**
 * Learner-composed outline: all sources remain independently authored notebook
 * documents. No auto-generated conclusions, copied book prose, or new writers.
 */
export function multiSourceComparisonMarkdown(sources:readonly ComparisonSource[]):string {
  const unique=new Set(sources.map(source=>source.note.id));
  if(sources.length<2||sources.length>6||unique.size!==sources.length)
    throw new Error('Choose between two and six distinct saved notes.');
  const rows=[
    '## Cross-book source comparison','',
    '> Working outline based on existing saved notebook notes.',
    '> Note references document provenance, not verified claims or book quotations.','',
    '### Shared research question','','',
    '### Source inventory','',
  ];
  for(const [index,source] of sources.entries()){
    rows.push((index+1)+'. '+noteReferenceMarkdown(source.note),
      '   - Book: '+source.bookTitle.replace(/[\r\n]/g,' '),
      '   - Recorded source: '+describeResearchSource(source.note.anchor,source.note.chapterKey)
        .replace(/[\r\n]/g,' '),
      '   - My note revision: '+source.note.revision);
    const topics=extractNotebookTopics(source.note.bodyMarkdown);
    if(topics.length)rows.push('   - Explicit topics: '+topics.map(topic=>'#'+topic).join(', '));
    const observations=noteEvidenceExcerpts(source.note.bodyMarkdown,2);
    if(observations.length){
      rows.push('   - Prompts drawn from my authored note (not quotations from the original book):');
      for(const observation of observations)
        rows.push('     - '+observation.replace(/[\r\n]/g,' ').slice(0,240));
    }
  }
  rows.push('','### Agreements supported by the notes','','',
    '### Differences in arguments or evidence','','',
    '### Source limitations and alternative interpretations','','',
    '### Working conclusion in my own words','','',
    '### What to verify in the original books','','',
    '### Next reading questions','',
    '- [ ] ');
  return rows.join('\n');
}
export function conciseSourceReferences(sources:readonly ComparisonSource[]):string {
  return sources.map(({note,bookTitle})=>
    '- '+bookTitle.replace(/[\r\n]/g,' ')+' — '+notebookTitle(note)
    +' · '+noteReferenceMarkdown(note)
    +' · '+describeResearchSource(note.anchor,note.chapterKey)).join('\n')+'\n';
}
