import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { loadResearchCollections, describeResearchSource, type ResearchCollection,
  type ResearchSource } from './note-research';
import { researchDossierMarkdown } from './note-research-handoff';
import { consolidateResearch, researchKnowledgeMarkdown } from './note-consolidation';
import { auditResearchCitations, evidenceReviewMarkdown } from './note-evidence-workflows';
import { researchSectionCitationLedger } from './note-research-n1t-ledger';

/**
 * Human-readable, source-qualified working research file, NOT a signed custody
 * artifact, authoritative backup, or independent approval. A complete source
 * set is required; partial exports can otherwise silently lose note content.
 */
export function completeResearchHandoff(
  collection:ResearchCollection,
  local:readonly BookNoteDocumentV1[],
  workTitle:(workId:string)=>string,
  readerLink:(note:BookNoteDocumentV1)=>string|undefined,
):string {
  const lookup=new Map(local.map(note=>[note.id,note]));
  const missing=collection.noteIds.filter(id=>!lookup.has(id));
  if(collection.synthesisId&&!lookup.has(collection.synthesisId))
    missing.push(collection.synthesisId);
  if(missing.length)throw new Error('Complete handoff blocked: '+missing.length
    +' local source or synthesis notes are unavailable. Restore notes using Library V2 backup first.');
  const synthesis=collection.synthesisId?lookup.get(collection.synthesisId):undefined;
  const sources:ResearchSource[]=collection.noteIds.map(id=>{
    const note=lookup.get(id)!;
    return {
      note,bookTitle:workTitle(note.workId),
      sourceLocation:describeResearchSource(note.anchor,note.chapterKey),
      sourceHref:readerLink(note),
    };
  });
  const research=consolidateResearch(collection,local,
    synthesis?.bodyMarkdown??'',loadResearchCollections(),workTitle);
  const audit=auditResearchCitations(collection,local,synthesis?.bodyMarkdown??'',workTitle);
  const rows=[
    '# Research handoff — '+collection.name.replace(/[\r\n#]/g,' ').trim(),
    '',
    '> THIEPN Library · local-first working Markdown export',
    '> This is NOT an authoritative Library V2 backup or signed evidence receipt.',
    '> The data below describes learner-authored notes; book quotations and claims require independent verification.',
    '',
    '## Collection and note revisions','',
    '- Collection ID: '+collection.id,
    '- Last collection edit: '+collection.updatedAt,
    '- Source count: '+collection.noteIds.length,
    '- Native synthesis note ID: '+(collection.synthesisId??'none'),
    '',
  ];
  for(const source of sources){
    const note=source.note;
    rows.push('- Source '+notebookTitle(note)+' · '+source.bookTitle
      +' · ID '+note.id+' · revision '+note.revision+' · updated '+note.updatedAt);
  }
  if(synthesis)rows.push('- Synthesis '+notebookTitle(synthesis)+' · ID '+synthesis.id
    +' · revision '+synthesis.revision+' · updated '+synthesis.updatedAt);
  rows.push('','---','',
    researchKnowledgeMarkdown(collection,research,sources,synthesis).trim(),
    '','---','',
    evidenceReviewMarkdown(collection,audit,synthesis).trim(),
    ...(synthesis?['','---','',
      researchSectionCitationLedger(collection,synthesis,local,workTitle,readerLink).trim()]:[]),
    '','---','',
    researchDossierMarkdown(collection,sources,synthesis).trim(),
    '');
  return rows.join('\n');
}
