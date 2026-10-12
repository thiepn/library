import { listBookNotes } from './note-store';
import { requestResearchView } from './note-research-n1q-view';
import { completeResearchHandoff } from './note-research-n1o-handoff';
import { researchSectionCitationLedger } from './note-research-n1t-ledger';
import { findNotebookNotes, noteReferenceMarkdown } from './note-links';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { loadResearchCollections, type ResearchCollection } from './note-research';
import { readNotebookContinuity, orderResearchCollections } from './note-continuity';
import {
  auditResearchCitations, collectResearchEvidence,
  evidenceToSynthesis, evidenceReviewMarkdown, type ResearchEvidence,
} from './note-evidence-workflows';

export interface ResearchN1OHost {
  active():ResearchCollection|undefined;
  notes():readonly BookNoteDocumentV1[];
  synthesis():BookNoteDocumentV1|undefined;
  draft():{title:string;body:string};
  isDirty():boolean;
  setDraft(title:string,body:string):void;
  pins():{left:string;right:string};
  bookTitle(workId:string):string;
  sourceHref(note:BookNoteDocumentV1):string|undefined;
  openNote(note:BookNoteDocumentV1):Promise<void>;
  openCollection(id:string):Promise<void>;
  collectNote(id:string):Promise<void>;
  pinSource(id:string):void;
  notify(message:string):void;
}
export interface ResearchN1OController {
  onCollectionChanged():void;
  onNotesChanged():void;
  onDraftChanged():void;
  dispose():void;
}
const simple=(tag:string,value:string):HTMLElement=>{
  const node=document.createElement(tag);node.textContent=value;return node;
};
const createButton=(label:string,callback:()=>void):HTMLButtonElement=>{
  const node=document.createElement('button');
  node.type='button';node.textContent=label;
  node.addEventListener('click',callback);return node;
};
const contains=(candidate:string,words:readonly string[])=>{
  const haystack=candidate.normalize('NFKC').toLocaleLowerCase();
  return words.every(word=>haystack.includes(word));
};
const short=(text:string,length=140)=>text.replace(/\s+/g,' ').trim().slice(0,length);
const filename=(label:string)=>label.normalize('NFKD')
  .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'research';
function download(name:string,body:string):void {
  const uri=URL.createObjectURL(new Blob([body],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a');a.href=uri;a.download=name;
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(uri),10000);
}
/**
 * An adapter onto N1A–N1N research state. Never mutates source notes,
 * creates another note writer, or changes sync/backup authority.
 */
export function mountResearchN1O(
  root:HTMLElement,host:ResearchN1OHost,
):ResearchN1OController {
  const $=<T extends HTMLElement>(selector:string):T=>{
    const control=root.querySelector<T>(selector);
    if(!control)throw new Error('Missing N1O control: '+selector);
    return control;
  };
  const hubQuery=$<HTMLInputElement>('[data-n1o-quick-search]');
  const hubKind=$<HTMLSelectElement>('[data-n1o-quick-type]');
  const hubCount=$<HTMLElement>('[data-n1o-hub-count]');
  const hubResults=$<HTMLElement>('[data-n1o-quick-results]');
  const evidenceSource=$<HTMLSelectElement>('[data-n1o-evidence-source]');
  const evidenceExcerpt=$<HTMLSelectElement>('[data-n1o-evidence-excerpt]');
  const evidenceMeta=$<HTMLElement>('[data-n1o-evidence-source-meta]');
  const evidencePreview=$<HTMLElement>('[data-n1o-evidence-excerpt-preview]');
  const evidenceCount=$<HTMLElement>('[data-n1o-evidence-summary]');
  const auditList=$<HTMLElement>('[data-n1o-audit-list]');
  const insertButton=$<HTMLButtonElement>('[data-n1o-insert-evidence]');
  const copyButton=$<HTMLButtonElement>('[data-n1o-copy-evidence]');
  const openButton=$<HTMLButtonElement>('[data-n1o-open-evidence]');
  const sourceLink=$<HTMLAnchorElement>('[data-n1o-reader-link]');
  const claimButton=$<HTMLButtonElement>('[data-n1o-write-claim]');
  const counterButton=$<HTMLButtonElement>('[data-n1o-write-counter]');
  const compareButton=$<HTMLButtonElement>('[data-n1o-write-source-review]');
  const writingHelp=$<HTMLElement>('[data-n1o-writing-help]');
  const exportLedger=$<HTMLButtonElement>('[data-n1t-export-ledger]');
  const synthesisBody=$<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const disposers:Array<()=>void>=[];
  let refreshTimer:ReturnType<typeof setTimeout>|undefined;
  let busyExport=false;
  let busyHandoff=false;
  let busyLedger=false;
  const bind=(selector:string,event:string,callback:EventListener)=>{
    const control=$(selector);control.addEventListener(event,callback);
    disposers.push(()=>control.removeEventListener(event,callback));
  };
  const safeOpen=(note:BookNoteDocumentV1):void=>{
    if(host.isDirty()&&!window.confirm(
      'Unsaved synthesis writing is open. Save or export your current draft before leaving this workspace? Cancel to continue writing.'))return;
    void host.openNote(note);
  };
  const available=()=>host.active()
    ?collectResearchEvidence(host.active()!,host.notes(),host.bookTitle).sources:[];
  function chosenSource():ResearchEvidence|undefined {
    return available().find(item=>item.id===evidenceSource.value);
  }
  function evidenceQuote():string|undefined {
    const source=chosenSource();
    const index=Number(evidenceExcerpt.value);
    if(!source||evidenceExcerpt.value===''||!Number.isInteger(index))return undefined;
    return source.excerpts[index];
  }
  function renderHub():void {
    const terms=hubQuery.value.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/)
      .filter(Boolean).slice(0,8);
    const type=hubKind.value;
    const collections=orderResearchCollections(loadResearchCollections());
    const notes=host.notes();
    const prefs=readNotebookContinuity();
    const items:Array<{kind:'collection'|'note';id:string;name:string;label:string;open:()=>void}>=[];
    if(type!=='notes'){
      const matches=collections.filter(collection=>{
        if(!terms.length)return true;
        const related=collection.noteIds.flatMap(id=>{
          const note=notes.find(entry=>entry.id===id);
          return note?[notebookTitle(note),host.bookTitle(note.workId)]:[];
        }).join(' ');
        return contains([collection.name,collection.description,related].join(' '),terms);
      }).slice(0,9);
      for(const collection of matches)items.push({
        kind:'collection',id:collection.id,name:collection.name,
        label:collection.noteIds.length+' source notes'
          +(prefs.favoriteCollectionIds.includes(collection.id)?' · Favorite':''),
        open:()=>{void host.openCollection(collection.id);},
      });
    }
    if(type!=='collections'){
      const matching=terms.length
        ?findNotebookNotes(notes,host.bookTitle,terms.join(' '),20)
        :[...notes].sort((a,b)=>{
          const ax=prefs.recentNoteIds.indexOf(a.id);
          const bx=prefs.recentNoteIds.indexOf(b.id);
          if(ax>=0&&bx>=0)return ax-bx;
          if(ax>=0)return -1;
          if(bx>=0)return 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        }).slice(0,9);
      for(const note of matching)items.push({
        kind:'note',id:note.id,name:notebookTitle(note),
        label:host.bookTitle(note.workId)+(prefs.recentNoteIds.includes(note.id)?' · Recently opened':''),
        open:()=>safeOpen(note),
      });
    }
    hubResults.replaceChildren();
    hubCount.textContent=items.length+' quick destinations';
    if(!items.length){
      hubResults.append(simple('p','No saved notes or research collections match this search.'));
      return;
    }
    for(const item of items){
      const row=document.createElement('div');
      row.className='book-notebook__n1o-quick-item';
      const info=document.createElement('div');
      info.append(simple('strong',item.name),simple('small',item.label));
      row.append(simple('span',item.kind==='collection'?'Workspace':'Note'),
        info,createButton('Open',item.open));
      if(item.kind==='note'){
        const note=notes.find(entry=>entry.id===item.id);
        if(note){
          row.append(createButton('Copy ref',()=>{
            void navigator.clipboard.writeText(noteReferenceMarkdown(note))
              .then(()=>host.notify('Stable note reference copied.'),
                ()=>host.notify('Clipboard unavailable.'));
          }));
          if(host.active()&&!host.active()!.noteIds.includes(note.id)){
            row.append(createButton('Collect',()=>{void host.collectNote(note.id);}));
          }else if(host.active()?.noteIds.includes(note.id)){
            row.append(createButton('Pin',()=>{
              host.pinSource(note.id);
              requestResearchView(root,'sources','[data-research-compare]');
            }));
          }
          const reader=host.sourceHref(note);
          if(reader){
            const link=document.createElement('a');
            link.href=reader;link.target='_blank';link.rel='noopener noreferrer';
            link.textContent='Original reader';
            link.title='Open this saved note’s recorded book source in another tab';
            row.append(link);
          }
        }
      }
      hubResults.append(row);
    }
  }
  function renderSourceOptions():void {
    const previous=evidenceSource.value;
    const sources=available();
    const pinned=host.pins().left;
    evidenceSource.replaceChildren(new Option('Choose a collected source…',''));
    for(const source of sources){
      evidenceSource.add(new Option(
        source.book+' — '+notebookTitle(source.note),source.id,
      ));
    }
    const ids=new Set(sources.map(source=>source.id));
    evidenceSource.value=ids.has(previous)?previous:ids.has(pinned)?pinned:sources[0]?.id??'';
    renderExcerptOptions();
  }
  function renderExcerptOptions():void {
    const previous=evidenceExcerpt.value;
    evidenceExcerpt.replaceChildren(new Option('Link and location only',''));
    const source=chosenSource();
    if(source){
      for(const [index,excerpt] of source.excerpts.entries()){
        evidenceExcerpt.add(new Option((index+1)+'. '+short(excerpt,95),String(index)));
      }
    }
    evidenceExcerpt.value=previous!==''&&source?.excerpts[Number(previous)]!==undefined
      ?previous:'';
    renderSourceDetails();
  }
  function renderSourceDetails():void {
    exportLedger.disabled=!host.synthesis()||busyLedger;
    const source=chosenSource();
    insertButton.disabled=!source||!host.synthesis();
    copyButton.disabled=!source;
    openButton.disabled=!source;
    evidenceMeta.replaceChildren();
    const quote=evidenceQuote();
    evidencePreview.textContent=quote?'From your saved note: '+quote
      :'Select an excerpt to include part of your own note in the citation scaffold.';
    if(!source){sourceLink.hidden=true;return;}
    evidenceMeta.append(
      simple('strong',notebookTitle(source.note)),
      simple('span',source.book+' · '+source.location),
      simple('small',source.topicNames.length
        ?'Topics: '+source.topicNames.map(t=>'#'+t).join(', ')
        :'No explicit topics on this note'),
    );
    const href=host.sourceHref(source.note);
    sourceLink.hidden=!href;
    if(href)sourceLink.href=href;
  }
  function insertMarkdown(text:string):void {
    if(!host.synthesis()){
      host.notify('Create a native synthesis note before inserting writing.');
      return;
    }
    const start=synthesisBody.selectionStart,end=synthesisBody.selectionEnd;
    const old=host.draft().body;
    const before=old.slice(0,start);
    const after=old.slice(end);
    const prefix=before&&!before.endsWith('\n')?'\n\n':'';
    const suffix=after&&!after.startsWith('\n')?'\n':'';
    const addition=prefix+text.trim()+'\n'+suffix;
    if(before.length+addition.length+after.length>250000){
      host.notify('This synthesis reached the maximum Markdown note size.');
      return;
    }
    host.setDraft(host.draft().title,before+addition+after);
    requestResearchView(root,'write','[data-research-synthesis-body]');
    synthesisBody.focus();
    synthesisBody.setSelectionRange(before.length+addition.length,before.length+addition.length);
    host.notify('Inserted into your synthesis draft. Save explicitly to commit the revision.');
  }
  function renderAudit():void {
    auditList.replaceChildren();
    const collection=host.active();
    if(!collection){
      evidenceCount.textContent='Choose a research collection to review references.';
      auditList.append(simple('p','Collect notes across books to begin evidence review.'));
      return;
    }
    const audit=auditResearchCitations(collection,host.notes(),host.draft().body,host.bookTitle);
    evidenceCount.textContent=audit.covered.filter(item=>item.linked).length
      +' of '+audit.covered.length+' available source notes linked · '
      +audit.unreferenced.length+' unlinked · '
      +audit.unavailableIds.length+' missing reference(s).';
    for(const source of audit.unreferenced.slice(0,20)){
      const row=document.createElement('div');
      row.className='book-notebook__n1o-audit-item';
      row.append(simple('span','Not linked: '+source.book+' — '+notebookTitle(source.note)),
        createButton('Select',()=>{
          evidenceSource.value=source.id;renderExcerptOptions();
          evidenceSource.scrollIntoView({block:'nearest'});
        }));
      auditList.append(row);
    }
    for(const note of audit.outOfCollection.slice(0,12)){
      const row=document.createElement('div');
      row.className='book-notebook__n1o-audit-item';
      row.append(simple('span','Linked outside collection: '+notebookTitle(note)),
        createButton('Open note',()=>safeOpen(note)),
        createButton('Collect',()=>{void host.collectNote(note.id);}));
      auditList.append(row);
    }
    for(const id of audit.unavailableIds.slice(0,12))
      auditList.append(simple('p','Unavailable local note ID: '+id));
    if(!auditList.children.length)
      auditList.append(simple('p','All locally available collected notes have explicit links in the current synthesis.'));
  }
  function renderReviewPrompts():void {
    const hasSynthesis=!!host.synthesis();
    claimButton.disabled=!hasSynthesis;
    counterButton.disabled=!hasSynthesis;
    compareButton.disabled=!hasSynthesis||available().length<2;
    writingHelp.textContent=hasSynthesis
      ?'Your writing remains a native revision-controlled notebook note.'
      :'Add sources and create a native synthesis note before inserting writing prompts.';
  }
  function onCollectionChanged():void {
    renderHub();renderSourceOptions();renderAudit();renderReviewPrompts();
  }
  function onNotesChanged():void {
    renderHub();renderSourceOptions();renderAudit();renderReviewPrompts();
  }
  function onDraftChanged():void {
    if(refreshTimer)clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{
      refreshTimer=undefined;
      renderAudit();renderReviewPrompts();
    },180);
  }

  bind('[data-n1o-quick-search]','input',renderHub);
  bind('[data-n1o-quick-type]','change',renderHub);
  bind('[data-n1o-evidence-source]','change',renderExcerptOptions);
  bind('[data-n1o-evidence-excerpt]','change',renderSourceDetails);
  bind('[data-n1o-open-evidence]','click',()=>{
    const evidence=chosenSource();
    if(evidence)safeOpen(evidence.note);
  });
  bind('[data-n1o-copy-evidence]','click',()=>{
    const evidence=chosenSource();
    if(!evidence)return;
    const text=evidenceToSynthesis(evidence,evidenceQuote(),'Reference to check');
    void navigator.clipboard.writeText(text)
      .then(()=>host.notify('Notebook evidence reference copied.'),
        ()=>host.notify('Clipboard unavailable; insert in synthesis or select the note.'));
  });
  bind('[data-n1o-insert-evidence]','click',()=>{
    const evidence=chosenSource();
    if(evidence)insertMarkdown(evidenceToSynthesis(evidence,evidenceQuote()));
  });
  bind('[data-n1o-write-claim]','click',()=>{
    const source=chosenSource();
    insertMarkdown([
      '## Claim, supporting evidence, and uncertainty','',
      '**Claim in my own words:**','','',
      '**Supporting note:** '+(source?noteReferenceMarkdown(source.note):'[Choose a saved source note]'),
      '',
      '**Reasoning and possible limits:**','','',
      '**Source facts still to verify:**','','',
    ].join('\n'));
  });
  bind('[data-n1o-write-counter]','click',()=>{
    insertMarkdown([
      '## Alternative interpretation','',
      '**Main objection or counterexample:**','','',
      '**Relevant evidence from saved notes:**','','',
      '**How this changes my conclusion:**','','',
    ].join('\n'));
  });
  bind('[data-n1o-write-source-review]','click',()=>{
    const sources=available();
    if(sources.length<2)return;
    const first=chosenSource()??sources[0];
    const second=sources.find(source=>source.id!==first.id);
    if(!second)return;
    insertMarkdown([
      '## Comparing two saved sources','',
      '**Source A:** '+noteReferenceMarkdown(first.note),
      '**Source B:** '+noteReferenceMarkdown(second.note),'',
      '**Common question:**','','',
      '**Agreements:**','','',
      '**Differences and limits:**','','',
      '**Conclusion to investigate further:**','','',
    ].join('\n'));
  });
  bind('[data-n1o-export-evidence]','click',()=>{
    if(busyExport)return;
    const active=host.active();
    if(!active){host.notify('Select a collection before exporting evidence.');return;}
    if(host.isDirty()){
      host.notify('Save the synthesis before exporting. The evidence report uses saved note revisions only.');
      return;
    }
    busyExport=true;
    void listBookNotes().then(all=>{
      const collection=loadResearchCollections().find(c=>c.id===active.id);
      if(!collection)throw new Error('This collection is no longer available.');
      const saved=collection.synthesisId
        ?all.find(note=>note.id===collection.synthesisId):undefined;
      if(collection.synthesisId&&!saved)
        throw new Error('The saved synthesis note is missing. Restore it before exporting.');
      const audit=auditResearchCitations(collection,all,saved?.bodyMarkdown??'',host.bookTitle);
      download('evidence-review-'+filename(collection.name)+'.md',
        evidenceReviewMarkdown(collection,audit,saved));
      host.notify('Evidence review export requested using saved notes and explicit links.');
    }).catch(error=>host.notify(
      error instanceof Error?error.message:'Evidence export unavailable.',
    )).finally(()=>{busyExport=false;});
  });

  bind('[data-n1t-export-ledger]','click',()=>{
    if(busyLedger)return;
    const active=host.active();
    if(!active){host.notify('Choose a research collection before exporting a saved citation ledger.');return;}
    if(host.isDirty()){
      host.notify('Save the current writing first. The citation ledger represents saved note revisions only.');
      return;
    }
    busyLedger=true;exportLedger.disabled=true;
    void listBookNotes().then(all=>{
      const latest=loadResearchCollections().find(item=>item.id===active.id);
      if(!latest?.synthesisId)throw new Error('This research collection has no saved native synthesis.');
      const saved=all.find(note=>note.id===latest.synthesisId);
      if(!saved)throw new Error('Saved synthesis is unavailable. Restore original notes using Library V2 backup.');
      const packet=researchSectionCitationLedger(latest,saved,all,host.bookTitle,host.sourceHref);
      download('section-citations-'+filename(latest.name)+'.md',packet);
      host.notify('Saved synthesis citation ledger download requested; current unsaved drafts were not included.');
    }).catch(error=>host.notify(
      error instanceof Error?error.message:'Section citation export unavailable.',
    )).finally(()=>{
      busyLedger=false;
      exportLedger.disabled=!host.synthesis();
    });
  });
  bind('[data-n1o-export-handoff]','click',()=>{
    if(busyHandoff)return;
    const active=host.active();
    if(!active){host.notify('Select a collection to export its complete handoff.');return;}
    if(host.isDirty()){
      host.notify('Save synthesis changes before exporting. A complete handoff includes saved revisions only.');
      return;
    }
    busyHandoff=true;
    void listBookNotes().then(notes=>{
      const latest=loadResearchCollections().find(c=>c.id===active.id);
      if(!latest)throw new Error('Collection unavailable. Nothing was exported.');
      const report=completeResearchHandoff(latest,notes,host.bookTitle,host.sourceHref);
      download('research-handoff-'+filename(latest.name)+'.md',report);
      host.notify('Complete research handoff download requested with saved notes and revision metadata.');
    }).catch(error=>host.notify(
      error instanceof Error?error.message:'Could not create a complete handoff.',
    )).finally(()=>{busyHandoff=false;});
  });
  const onPreference=()=>renderHub();
  window.addEventListener('library-notebook-preferences-changed',onPreference);
  onCollectionChanged();
  return {
    onCollectionChanged,onNotesChanged,onDraftChanged,
    dispose(){
      if(refreshTimer)clearTimeout(refreshTimer);
      window.removeEventListener('library-notebook-preferences-changed',onPreference);
      for(const off of disposers)off();
    },
  };
}
