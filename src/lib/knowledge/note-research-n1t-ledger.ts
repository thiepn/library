import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { noteReferenceMarkdown } from './note-links';
import { researchSynthesisSections } from './note-research-n1r-sections';
import { describeResearchSource, type ResearchCollection } from './note-research';

/** Saved-document source ledger; never certify claims or include uncommitted drafts. */
export function researchSectionCitationLedger(
  collection:ResearchCollection,
  savedSynthesis:BookNoteDocumentV1,
  notes:readonly BookNoteDocumentV1[],
  workTitle:(workId:string)=>string,
  sourceHref?:(note:BookNoteDocumentV1)=>string|undefined,
):string {
  if(!collection.synthesisId||savedSynthesis.id!==collection.synthesisId)
    throw new Error('This synthesis does not belong to the selected local collection.');
  const byId=new Map(notes.map(note=>[note.id,note]));
  const collected=new Set(collection.noteIds);
  const sections=researchSynthesisSections(savedSynthesis.bodyMarkdown);
  const stats={withCitations:0,withoutCitations:0,unavailable:0,outside:0};
  const headings:string[]=[];
  for(const section of sections){
    const sourceNotes=section.sourceIds.map(id=>({id,note:byId.get(id)}));
    if(sourceNotes.length)stats.withCitations++;
    else stats.withoutCitations++;
    stats.unavailable+=sourceNotes.filter(item=>!item.note).length;
    stats.outside+=sourceNotes.filter(item=>item.note&&!collected.has(item.id)).length;
    headings.push('### '+section.title.replace(/[\r\n#]/g,' ').trim(),'',
      '- Heading level: '+section.level,
      '- Authored note references: '+sourceNotes.length);
    if(!sourceNotes.length)headings.push(
      '- No explicit saved-note references in this section (not a claim validity assessment)');
    for(const {id,note} of sourceNotes){
      if(!note){
        headings.push('- Unavailable local note · note:'+id+' — restore only through established V2 recovery.');
        continue;
      }
      headings.push('- '+workTitle(note.workId)+' — '+notebookTitle(note)
        +' · '+noteReferenceMarkdown(note)
        +' · revision '+note.revision
        +(collected.has(id)?' · in collection':' · referenced outside collection'),
        '  - Recorded location: '+describeResearchSource(note.anchor,note.chapterKey));
      const href=sourceHref?.(note);
      if(href)headings.push('  - Reader: '+href.replace(/[\r\n]/g,' '));
    }
    headings.push('');
  }
  return [
    '# Synthesis section citation ledger — '+collection.name.replace(/[\r\n#]/g,' ').trim(),'',
    '> Derived from SAVED native synthesis revision '+savedSynthesis.revision+'.',
    '> Explicit citations are location pointers, not evidence that a claim is true.',
    '> This is not an authoritative V2 backup or a reconstruction of missing notes.','',
    '- Collection ID: '+collection.id,
    '- Synthesis note: '+savedSynthesis.id,
    '- Saved at: '+savedSynthesis.updatedAt,
    '- Sections: '+sections.length,
    '- Sections with explicit note links: '+stats.withCitations,
    '- Sections with no explicit note links: '+stats.withoutCitations,
    '- Unavailable cited note references: '+stats.unavailable,
    '- Referenced notes outside the collection: '+stats.outside,
    '',
    ...(headings.length?headings:['_No Markdown headings found. Add headings to navigate this saved synthesis._','']),
    '## Review before relying on citations','',
    '- [ ] Compare each cited learner note to its original book passage',
    '- [ ] Resolve unavailable note IDs using authoritative Library V2 restore',
    '- [ ] Confirm whether out-of-collection sources should be explicitly collected',
    '- [ ] Review sections with no links and deliberately add sources where appropriate','',
  ].join('\n');
}
