import type { BookNoteDocumentV1 } from './note-model';
import { notebookTitle } from './note-model';
import { noteReferenceMarkdown } from './note-links';
import {
  researchCitationLocations, citationCountForNote, nextResearchCitation,
  previousResearchCitation,
  insertResearchNoteLink,
} from './note-research-n1q-citations';

/**
 * Presentational orchestration of existing research features.
 * No new persistent state or competing writer. All existing N1A–N1P nodes
 * remain mounted, so evidence, recovery and citation actions keep their owners.
 */
export type ResearchView='browse'|'sources'|'write'|'review';
export interface ResearchReveal {
  view:ResearchView;
  selector?:string;
  focus?:boolean;
}
export function requestResearchView(
  root:HTMLElement,view:ResearchView,selector?:string,focus=false,
):void {
  root.dispatchEvent(new CustomEvent<ResearchReveal>('library-research-reveal',{
    bubbles:true,detail:{view,selector,focus},
  }));
}
export interface ResearchViewController {
  show(view:ResearchView,selector?:string,focus?:boolean):void;
  onCollectionChanged():void;
  onDraftChanged():void;
  onNotesChanged():void;
  dispose():void;
}
const viewSelectors:Record<ResearchView,readonly string[]>={
  browse:[
    '.book-notebook__research-create',
    '.book-notebook__n1o-hub',
    '[data-n1q-workspaces]',
    '[data-n1q-organize]',
    '.book-notebook__research-pick',
  ],
  sources:[
    '.book-notebook__research-sources',
    '.book-notebook__research-compare',
    '.book-notebook__bibliography',
    '.book-notebook__n1p-workflow',
  ],
  write:[
    '.book-notebook__n1p-comparison',
    '.book-notebook__n1o-evidence',
    '.book-notebook__n1m-consolidation',
    '.book-notebook__research-write',
  ],
  review:[
    '.book-notebook__n1p-review',
    '.book-notebook__n1l-session',
  ],
};
const modes:ResearchView[]=['browse','sources','write','review'];
export function mountResearchViews(
  root:HTMLElement,host:{
    active():{name:string;noteIds:readonly string[]}|undefined;
    synthesis():{revision:number}|undefined;
    dirty():boolean;
    notes():readonly BookNoteDocumentV1[];
    draft():{title:string;body:string};
    setDraft(title:string,body:string):void;
    openNote(note:BookNoteDocumentV1):Promise<void>;
    pinSource(id:string):void;
    bookTitle(workId:string):string;
    sourceHref(note:BookNoteDocumentV1):string|undefined;
  },
):ResearchViewController {
  const tabs=root.querySelector<HTMLElement>('[data-n1q-tabs]');
  const indicator=root.querySelector<HTMLElement>('[data-n1q-view-state]');
  const exportKind=root.querySelector<HTMLSelectElement>('[data-n1q-export-format]');
  const exportRun=root.querySelector<HTMLButtonElement>('[data-n1q-export-run]');
  const exportStatus=root.querySelector<HTMLElement>('[data-n1q-export-status]');
  if(!exportKind||!exportRun||!exportStatus)
    throw new Error('Unified research export chooser is missing.');
  if(!tabs||!indicator)throw new Error('Unified research workspace navigation is missing.');
  const citeSelect=root.querySelector<HTMLSelectElement>('[data-n1q-citation-source]');
  const citeCount=root.querySelector<HTMLElement>('[data-n1q-citation-count]');
  const citeStatus=root.querySelector<HTMLElement>('[data-n1q-citation-status]');
  const synthBody=root.querySelector<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const citeInsert=root.querySelector<HTMLButtonElement>('[data-n1q-citation-insert]');
  const citeNext=root.querySelector<HTMLButtonElement>('[data-n1q-citation-next]');
  const citePrevious=root.querySelector<HTMLButtonElement>('[data-n1q-citation-previous]');
  const citeCopy=root.querySelector<HTMLButtonElement>('[data-n1r-citation-copy]');
  const citeReader=root.querySelector<HTMLAnchorElement>('[data-n1r-citation-reader]');
  const citeContext=root.querySelector<HTMLElement>('[data-n1r-citation-context]');
  const citeOpen=root.querySelector<HTMLButtonElement>('[data-n1q-citation-open]');
  const citePin=root.querySelector<HTMLButtonElement>('[data-n1q-citation-pin]');
  if(!citeSelect||!citeCount||!citeStatus||!synthBody
    ||!citeInsert||!citeNext||!citePrevious||!citeCopy||!citeReader||!citeContext
    ||!citeOpen||!citePin)
    throw new Error('Inline synthesis citation navigator is missing.');
  const controls=new Map<ResearchView,HTMLButtonElement>();
  for(const view of modes){
    const button=tabs.querySelector<HTMLButtonElement>('[data-n1q-view="'+view+'"]');
    if(!button)throw new Error('Missing research view '+view);
    controls.set(view,button);
  }
  const panels=new Map<ResearchView,HTMLElement[]>();
  for(const view of modes){
    const list=viewSelectors[view].map(selector=>{
      const el=root.querySelector<HTMLElement>(selector);
      if(!el)throw new Error('Missing research work area '+selector);
      return el;
    });
    panels.set(view,list);
  }
  let active:ResearchView='browse';
  let mounted=false;
  const callbacks:Array<()=>void>=[];
  let citationRefresh:ReturnType<typeof setTimeout>|undefined;
  const availableSources=()=>{
    const indexed=new Map(host.notes().map(note=>[note.id,note]));
    return host.active()?.noteIds.flatMap(id=>{
      const note=indexed.get(id);
      return note?[note]:[];
    })??[];
  };
  function chosen():BookNoteDocumentV1|undefined {
    return availableSources().find(note=>note.id===citeSelect.value);
  }
  function updateCitations():void {
    const previous=citeSelect.value;
    const sources=availableSources();
    const references=researchCitationLocations(host.draft().body);
    const unique=new Set(references.map(ref=>ref.id));
    const known=new Set(host.notes().map(note=>note.id));
    const missing=[...unique].filter(id=>!known.has(id)).length;
    citeSelect.replaceChildren(new Option('Choose a collected source…',''));
    for(const note of sources){
      const uses=citationCountForNote(references,note.id);
      citeSelect.add(new Option((uses?'['+uses+' cited] ':'[Uncited] ')
        +host.bookTitle(note.workId)+' — '+notebookTitle(note),note.id));
    }
    citeSelect.value=sources.some(note=>note.id===previous)?previous:sources[0]?.id??'';
    const current=chosen();
    const uses=current?citationCountForNote(references,current.id):0;
    citeCount.textContent=unique.size+' linked note IDs'
      +(missing?' · '+missing+' missing locally':'')
      +' · '+sources.length+' available collection sources';
    citeInsert.disabled=!current||!host.synthesis();
    citeNext.disabled=!current||!uses||!host.synthesis();
    citePrevious.disabled=citeNext.disabled;
    citeOpen.disabled=!current;
    citePin.disabled=!current;
    citeCopy.disabled=!current;
    const href=current?host.sourceHref(current):undefined;
    citeReader.hidden=!href;
    if(href)citeReader.href=href;
    citeContext.textContent=current
      ?host.bookTitle(current.workId)+' · Note revision '+current.revision
        +' · '+uses+' link(s) in this synthesis'
        +' · Source anchor '+(current.anchor?.format??'not recorded')
      :'Select a collected note to see its saved source and citation status.';
  }
  const bindCitation=(node:HTMLElement,event:string,callback:EventListener)=>{
    node.addEventListener(event,callback);
    callbacks.push(()=>node.removeEventListener(event,callback));
  };
  const exportOptions:Record<string,{target:string;needsCollection:boolean;draft:boolean}>={
    handoff:{target:'[data-n1o-export-handoff]',needsCollection:true,draft:false},
    knowledge:{target:'[data-n1m-export-knowledge]',needsCollection:true,draft:false},
    ledger:{target:'[data-n1t-export-ledger]',needsCollection:true,draft:false},
    section:{target:'[data-n1r-section-export]',needsCollection:true,draft:true},
    comparison:{target:'[data-n1p-compare-export]',needsCollection:true,draft:true},
    evidence:{target:'[data-n1o-export-evidence]',needsCollection:true,draft:false},
    bibliography:{target:'[data-research-export-bibliography]',needsCollection:true,draft:false},
    'research-package':{target:'[data-research-export-package]',needsCollection:true,draft:false},
    catalogue:{target:'[data-n1m-export-catalogue]',needsCollection:false,draft:false},
    index:{target:'[data-research-export-index]',needsCollection:false,draft:false},
    review:{target:'[data-n1p-export-review]',needsCollection:false,draft:true},
    draft:{target:'[data-research-download-draft]',needsCollection:true,draft:true},
  };
  bindCitation(exportRun,'click',()=>{
    const option=exportOptions[exportKind.value];
    if(!option)return;
    if(option.needsCollection&&!host.active()){
      exportStatus.textContent='Choose a research collection before exporting this material.';
      return;
    }
    if(option.draft&&exportKind.value==='draft'&&!host.synthesis()){
      exportStatus.textContent='Create a native synthesis note before downloading its current editor draft.';
      return;
    }
    if(!option.draft&&host.dirty()){
      exportStatus.textContent='Save the current synthesis first; this export includes saved notebook revisions only. Use the draft output for unsaved text.';
      return;
    }
    const target=root.querySelector<HTMLButtonElement>(option.target);
    if(!target||target.disabled){
      exportStatus.textContent='The selected export is not available in this workspace.';
      return;
    }
    target.click();
    exportStatus.textContent='Handed off to the existing '+exportKind.selectedOptions[0]?.textContent
      +' export action. No notebook changes are made by this chooser.';
  });
  bindCitation(citeSelect,'change',updateCitations);
  bindCitation(citeInsert,'click',()=>{
    const note=chosen();if(!note||!host.synthesis())return;
    try {
      const changed=insertResearchNoteLink(host.draft().body,
        synthBody.selectionStart,synthBody.selectionEnd,note,synthBody.maxLength);
      host.setDraft(host.draft().title,changed.body);
      show('write','[data-research-synthesis-body]');
      synthBody.focus();
      synthBody.setSelectionRange(changed.cursor,changed.cursor);
      citeStatus.textContent='Stable note link inserted into the native synthesis editor. Save to commit.';
      updateCitations();
    }catch(error){
      citeStatus.textContent=error instanceof Error?error.message:'Cannot insert citation.';
    }
  });
  bindCitation(citePrevious,'click',()=>{
    const note=chosen();if(!note)return;
    const location=previousResearchCitation(researchCitationLocations(host.draft().body),
      note.id,synthBody.selectionStart);
    if(!location){citeStatus.textContent='No authored citation exists for this note.';return;}
    show('write','[data-research-synthesis-body]');
    synthBody.focus();
    synthBody.setSelectionRange(location.start,location.end);
    citeStatus.textContent='Located the previous authored citation; no note content changed.';
  });
  bindCitation(citeCopy,'click',()=>{
    const note=chosen();if(!note)return;
    const reference=noteReferenceMarkdown(note);
    void navigator.clipboard.writeText(reference)
      .then(()=>{citeStatus.textContent='Stable-ID reference copied from the saved note.';},
        ()=>{citeStatus.textContent='Clipboard unavailable; use Insert stable link.';});
  });
  bindCitation(citeNext,'click',()=>{
    const note=chosen();if(!note)return;
    const references=researchCitationLocations(host.draft().body);
    const next=nextResearchCitation(references,note.id,synthBody.selectionEnd);
    if(!next){citeStatus.textContent='This source is not yet cited in the synthesis.';return;}
    show('write','[data-research-synthesis-body]');
    synthBody.focus();
    synthBody.setSelectionRange(next.start,next.end);
    citeStatus.textContent='Located an existing stable-ID reference in this synthesis draft.';
  });
  bindCitation(citeOpen,'click',()=>{
    const note=chosen();if(!note)return;
    if(host.dirty()&&!window.confirm(
      'Synthesis writing is unsaved. Leave the writing area and open the source note? Save or download a recovery copy first if needed.'))return;
    void host.openNote(note);
  });
  bindCitation(citePin,'click',()=>{
    const note=chosen();if(!note)return;
    host.pinSource(note.id);
    show('sources','[data-research-compare]');
    citeStatus.textContent='Selected source in the existing side-by-side reader.';
  });
  function updateState():void {
    const collection=host.active();
    const suffix=collection
      ?' · '+collection.noteIds.length+' sources'
        +(host.synthesis()?' · synthesis revision '+host.synthesis()!.revision:'')
        +(host.dirty()?' · unsaved writing':'')
      :' · choose or create a collection';
    indicator.textContent={
      browse:'Discover notes and collections',
      sources:'Read and cite collected sources',
      write:'Develop your native synthesis',
      review:'Practice with temporary review queues',
    }[active]+suffix;
  }
  function show(view:ResearchView,selector?:string,focus=false):void {
    if(!modes.includes(view))return;
    active=view;
    for(const [mode,elements] of panels){
      for(const panel of elements)panel.hidden=mode!==view;
      const button=controls.get(mode)!;
      button.setAttribute('aria-pressed',String(mode===view));
      button.dataset.active=String(mode===view);
    }
    updateState();
    if(selector){
      const destination=root.querySelector<HTMLElement>(selector);
      if(destination){
        // Disclosures stay closed unless a workflow explicitly navigates into them.
        const disclosure=destination.closest<HTMLDetailsElement>('details[data-n1q-workspaces],details[data-n1q-organize]');
        if(disclosure)disclosure.open=true;
        const target=destination;
        // Reveal any collapsed native subsection, without changing its storage.
        requestAnimationFrame(()=>{
          target.scrollIntoView({behavior:'smooth',block:'center'});
          if(focus && 'focus' in target){
            if(!target.matches('input,textarea,select,button,a,[tabindex]'))
              target.setAttribute('tabindex','-1');
            target.focus({preventScroll:true});
          }
        });
      }
    }else if(mounted){
      // Avoid jumping away from an active edit without explicit user navigation.
      tabs.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  }
  for(const view of modes){
    const button=controls.get(view)!;
    const cb=()=>show(view);
    button.addEventListener('click',cb);
    callbacks.push(()=>button.removeEventListener('click',cb));
  }
  const reveal=(event:Event)=>{
    const detail=(event as CustomEvent<ResearchReveal>).detail;
    if(detail?.view)show(detail.view,detail.selector,detail.focus);
  };
  root.addEventListener('library-research-reveal',reveal);
  const keys=(event:KeyboardEvent)=>{
    if(!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey)return;
    const view=modes[Number(event.key)-1];
    if(!view)return;
    event.preventDefault();show(view);
  };
  root.addEventListener('keydown',keys);
  callbacks.push(()=>{
    root.removeEventListener('library-research-reveal',reveal);
    root.removeEventListener('keydown',keys);
  });
  show('browse');
  mounted=true;
  updateCitations();
  return {
    show,
    onCollectionChanged(){updateState();updateCitations();},
    onDraftChanged(){
      updateState();
      if(citationRefresh)clearTimeout(citationRefresh);
      citationRefresh=setTimeout(()=>{citationRefresh=undefined;updateCitations();},160);
    },
    onNotesChanged(){updateState();updateCitations();},
    dispose(){
      if(citationRefresh)clearTimeout(citationRefresh);
      for(const off of callbacks)off();
    },
  };
}
