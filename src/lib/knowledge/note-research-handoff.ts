import { groupedResearchMarkdown, type ResearchCollection, type ResearchSource } from './note-research';
import { researchBibliographyMarkdown, researchReferences } from './note-references';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';

/**
 * Exports reference existing authoritative notes. Session review progress and
 * unsaved synthesis edits are not silently labeled as completed/saved work.
 */
export function researchBriefMarkdown(
  collection:ResearchCollection,sources:readonly ResearchSource[],
  synthesis?:BookNoteDocumentV1,
):string {
  const known=new Set(sources.map(source=>source.note.id));
  const missing=collection.noteIds.filter(id=>!known.has(id));
  const grouped=[...new Set(sources.map(source=>source.bookTitle))];
  const lines=[
    '# '+collection.name.replace(/[\r\n#]/g,' ').trim(),
    '',
    collection.description.trim()||'_No research question recorded._',
    '',
    '> THIEPN Library · private research brief',
    '> Source details are taken from your own notebook metadata, not an independently verified bibliography.',
    '',
    '## Research overview',
    '',
    '- Source notes: '+collection.noteIds.length,
    '- Available sources: '+sources.length,
    '- Books represented: '+grouped.length,
    '- Unavailable note IDs: '+missing.length,
    '',
    '## Source reading order',
    '',
    ...sources.map((s,i)=>
      (i+1)+'. '+s.bookTitle+' — '+notebookTitle(s.note)
      +' ('+s.sourceLocation+') · note:'+s.note.id),
    '',
  ];
  if(missing.length)lines.push('## Unavailable source records','',
    ...missing.map(id=>'- Missing local note ID: '+id),'');
  lines.push('## Synthesis', '',
    synthesis? '**Native note ID:** '+synthesis.id : '_No saved synthesis note attached._',
    '',
    synthesis?.bodyMarkdown.trim()||'',
    '',
    researchBibliographyMarkdown(researchReferences(sources)));
  return lines.join('\n').trim()+'\n';
}
export function researchDossierMarkdown(
  collection:ResearchCollection,sources:readonly ResearchSource[],
  synthesis?:BookNoteDocumentV1,
):string {
  return groupedResearchMarkdown(collection,sources,synthesis)
    +'\n---\n\n## Source reference register\n\n'
    +researchBibliographyMarkdown(researchReferences(sources));
}
