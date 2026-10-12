import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { noteReferenceMarkdown } from './note-links';
import { noteEvidenceExcerpts } from './note-evidence-workflows';
import { describeResearchSource } from './note-research';
import { extractNotebookTopics } from './note-workspace';

export interface ResearchComparePair {
  first:BookNoteDocumentV1;
  second:BookNoteDocumentV1;
}
export interface ResearchCompareOutline {
  markdown:string;
  sharedTopics:string[];
  sourceCount:2;
}
/**
 * Preserves two independent user-authored note documents. Excerpts are never
 * described as quotations from the books; no automatic agreements are inferred.
 */
export function sourceLinkedComparison(
  {first,second}:ResearchComparePair,
  title:(workId:string)=>string,
):ResearchCompareOutline {
  if(first.id===second.id)throw new Error('Select two different saved source notes.');
  if(first.scope==='book-overview'&&second.scope==='book-overview'
    &&first.workId===second.workId&&first.title===second.title)
    throw new Error('Choose two independent saved source notes.');
  const safe=(s:string)=>s.replace(/[\r\n]+/g,' ').trim();
  const firstTopics=new Set(extractNotebookTopics(first.bodyMarkdown));
  const secondTopics=new Set(extractNotebookTopics(second.bodyMarkdown));
  const shared=[...firstTopics].filter(topic=>secondTopics.has(topic));
  const rows=[
    '### Comparing two saved source notes','',
    '> Writing scaffold from existing learner-authored notes; no conclusions are inferred.',
    '> Excerpts are from my notes, not authenticated quotations from either book.',
    '',
    '**Research question:**','','',
    '**Source A:** '+noteReferenceMarkdown(first),
    '- Book: '+safe(title(first.workId)),
    '- Recorded location: '+safe(describeResearchSource(first.anchor,first.chapterKey)),
    '- Saved note revision: '+first.revision,
    '',
    '**Source B:** '+noteReferenceMarkdown(second),
    '- Book: '+safe(title(second.workId)),
    '- Recorded location: '+safe(describeResearchSource(second.anchor,second.chapterKey)),
    '- Saved note revision: '+second.revision,
    '',
    '**Explicit topics occurring in both notes:** '
      +(shared.length?shared.map(topic=>'#topic/'+topic).join(', '):'None recorded'),
    '',
    '#### Selected passages from my saved notes (check original context)',
    '',
  ];
  for(const [label,source] of [['A',first],['B',second]] as const){
    const snippets=noteEvidenceExcerpts(source.bodyMarkdown,3).slice(0,3);
    rows.push('**My note '+label+':**');
    if(snippets.length)for(const excerpt of snippets)
      rows.push('- '+safe(excerpt).slice(0,350));
    else rows.push('- No suitable learner-authored excerpt available.');
    rows.push('');
  }
  rows.push('#### Points of agreement to verify','','',
    '#### Contrasts or counterexamples to verify','','',
    '#### Limits of each source and missing context','','',
    '#### Revised interpretation in my own words','','',
    '#### Original locations to reread','','',
    '- [ ] Verify Source A against the original book',
    '- [ ] Verify Source B against the original book','');
  return {markdown:rows.join('\n'),sharedTopics:shared,sourceCount:2};
}
export function comparisonWorkingCopy(
  pair:ResearchComparePair,
  title:(workId:string)=>string,
  collection:{id:string;name:string},
  baseRevision:number,
):string {
  return [
    '# Research comparison working copy — '+collection.name.replace(/[\r\n#]/g,' ').trim(),'',
    '> Local export only. Not an authoritative notebook save, a V2 backup or a signed source receipt.',
    '- Collection ID: '+collection.id,
    '- Native synthesis base revision: '+baseRevision,
    '- Source note IDs: '+pair.first.id+' · '+pair.second.id,
    '',
    sourceLinkedComparison(pair,title).markdown,
    '',
  ].join('\n');
}
