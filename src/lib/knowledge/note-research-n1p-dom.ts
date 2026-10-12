import {
  multiSourceComparisonMarkdown, conciseSourceReferences, type ComparisonSource,
} from './note-research-n1p-writing';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { noteReferenceMarkdown } from './note-links';
import { readResearchDraftCheckpoint } from './note-research-drafts';
import { loadResearchCollections, describeResearchSource,
  type ResearchCollection } from './note-research';
import {
  collectCrossBookReviewQueue, summarizeCrossBookQueue,
  updateCrossBookReviewState, crossBookReviewPacketMarkdown,
  type QueueFilter, type ResearchQueueItem,
} from './note-cross-book-review';
import { readResearchSession, newResearchSession, storeResearchSession } from './note-research-session';
import { orderResearchCollections } from './note-continuity';

export interface ResearchN1PHost {
  active():ResearchCollection|undefined;
  notes():readonly BookNoteDocumentV1[];
  synthesis():BookNoteDocumentV1|undefined;
  draft():{title:string;body:string};
  setDraft(title:string,body:string):void;
  isDirty():boolean;
  pins():{left:string;right:string};
  setPins(left:string,right:string):void;
  openNote(note:BookNoteDocumentV1):Promise<void>;
  openCollection(id:string):Promise<void>;
  sourceHref(note:BookNoteDocumentV1):string|undefined;
  bookTitle(id:string):string;
  refreshReview():void;
  notify(message:string):void;
}
export interface ResearchN1PController {
  onCollectionChanged():void;
  onNotesChanged():void;
  onDraftChanged():void;
  dispose():void;
}
function element(tag:string,text:string):HTMLElement {
  const node=document.createElement(tag);
  node.textContent=text;
  return node;
}
function action(label:string,run:()=>void):HTMLButtonElement {
  const button=document.createElement('button');
  button.type='button';button.textContent=label;
  button.addEventListener('click',run);
  return button;
}
function downloadMarkdown(filename:string,markdown:string):void {
  const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function safeFile(value:string):string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-')
    .replace(/^-+|-+$/g,'').slice(0,65)||'research';
}
export function mountResearchN1P(
  root:HTMLElement,host:ResearchN1PHost,
):ResearchN1PController {
  const $=<T extends HTMLElement>(selector:string):T=>{
    const node=root.querySelector<T>(selector);
    if(!node)throw new Error('Missing N1P research control: '+selector);
    return node;
  };
  const collectionSelect=$<HTMLSelectElement>('[data-n1p-review-collection]');
  const filter=$<HTMLSelectElement>('[data-n1p-review-filter]');
  const queue=$<HTMLElement>('[data-n1p-review-queue]');
  const count=$<HTMLElement>('[data-n1p-review-count]');
  const status=$<HTMLElement>('[data-n1p-review-status]');
  const info=$<HTMLElement>('[data-n1p-flow-info]');
  const path=$<HTMLElement>('[data-n1p-source-path]');
  const start=$<HTMLButtonElement>('[data-n1p-review-start]');
  const openSource=$<HTMLButtonElement>('[data-n1p-go-source]');
  const openReader=$<HTMLButtonElement>('[data-n1p-go-reader]');
  const openSynthesis=$<HTMLButtonElement>('[data-n1p-go-synthesis]');
  const focusWriting=$<HTMLButtonElement>('[data-n1p-focus-writing]');
  const saveCopy=$<HTMLButtonElement>('[data-n1p-download-working-copy]');
  const copyWorking=$<HTMLButtonElement>('[data-n1p-copy-working-copy]');
  const openRecovery=$<HTMLButtonElement>('[data-n1p-recovery-jump]');
  const writingArea=$<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const basketSelect=$<HTMLSelectElement>('[data-n1p-compare-select]');
  const basketList=$<HTMLElement>('[data-n1p-comparison-items]');
  const basketCount=$<HTMLElement>('[data-n1p-compare-count]');
  const basketStatus=$<HTMLElement>('[data-n1p-compare-status]');
  const basketInsert=$<HTMLButtonElement>('[data-n1p-compare-insert]');
  const basketCopy=$<HTMLButtonElement>('[data-n1p-compare-copy]');
  const basketExport=$<HTMLButtonElement>('[data-n1p-compare-export]');
  const removes:Array<()=>void>=[];
  let disposed=false;
  let reviewToken=0;
  let lastBasketCollection='';
  let basketIds:string[]=[];
  const bind=(query:string,kind:string,cb:EventListener)=>{
    const node=$(query);node.addEventListener(kind,cb);
    removes.push(()=>node.removeEventListener(kind,cb));
  };
  const selectedSource=()=>{
    const id=host.pins().left;
    return host.notes().find(note=>note.id===id);
  };
  function renderCollectionChoices():void {
    const old=collectionSelect.value;
    collectionSelect.replaceChildren(new Option('All collections','all'));
    for(const c of orderResearchCollections(loadResearchCollections()))
      collectionSelect.add(new Option(c.name,c.id));
    collectionSelect.value=[...collectionSelect.options].some(o=>o.value===old)?old:'all';
    start.disabled=!host.active()?.noteIds.length;
  }
  function renderQueue():void {
    queue.replaceChildren();
    const collections=loadResearchCollections();
    const notes=host.notes();
    const summary=summarizeCrossBookQueue(collections,notes);
    count.textContent=summary.revisit+' revisit · '+summary.pending+' pending · '
      +summary.reviewed+' reviewed across '+summary.books+' books'
      +(summary.unavailable?' · '+summary.unavailable+' unavailable source(s)':'');
    const filtered=collectCrossBookReviewQueue(collections,notes,collectionSelect.value,
      filter.value as QueueFilter,90);
    if(!filtered.length){
      queue.append(element('p','No notes in this view. Start a collection session, or change the status filter.'));
      return;
    }
    for(const item of filtered){
      const row=document.createElement('article');
      row.className='book-notebook__n1p-review-entry';
      const name=document.createElement('div');
      name.className='book-notebook__n1p-review-details';
      name.append(
        element('strong',notebookTitle(item.note)),
        element('span',host.bookTitle(item.note.workId)+' · '+item.collectionName),
        element('small',describeResearchSource(item.note.anchor,item.note.chapterKey)),
        element('small',item.state==='revisit'?'Needs revisit':item.state==='reviewed'?'Self-marked reviewed':'Pending'),
      );
      const controls=document.createElement('div');
      controls.className='book-notebook__n1p-review-actions';
      const process=(state:'reviewed'|'revisit'|'pending')=>{
        const activeCollection=loadResearchCollections().find(c=>c.id===item.collectionId);
        if(!activeCollection){status.textContent='Collection unavailable. Nothing changed.';return;}
        try{
          updateCrossBookReviewState(activeCollection,host.notes(),item.note.id,state);
          status.textContent='Temporary research review flag updated. No note was graded or changed.';
          host.refreshReview();
          renderQueue();
        }catch(error){status.textContent=error instanceof Error?error.message:'Review update unavailable.';}
      };
      controls.append(
        action('Open',()=>{void host.openNote(item.note);}),
        action('Study in collection',()=>{void openReviewSource(item);}),
        action('Copy citation',()=>{
          void navigator.clipboard.writeText(noteReferenceMarkdown(item.note))
            .then(()=>{status.textContent='Stable note reference copied.';},
              ()=>{status.textContent='Clipboard unavailable. Open the note to copy its reference.';});
        }),
        action('Reviewed',()=>process('reviewed')),
        action('Revisit',()=>process('revisit')),
      );
      if(item.state!=='pending')controls.append(action('Reset',()=>process('pending')));
      const reader=host.sourceHref(item.note);
      if(reader){
        const link=document.createElement('a');
        link.href=reader;link.textContent='Open book';
        link.title='Opens the existing book reader; exact original location is listed on this card.';
        controls.append(link);
      }
      row.append(name,controls);queue.append(row);
    }
  }
  async function openReviewSource(item:ResearchQueueItem):Promise<void> {
    const token=++reviewToken;
    if(host.active()?.id!==item.collectionId)await host.openCollection(item.collectionId);
    if(disposed||token!==reviewToken)return;
    if(host.active()?.id!==item.collectionId){
      status.textContent='Collection navigation was canceled; the synthesis draft was kept.';
      return;
    }
    const notes=host.active()?.noteIds??[];
    const other=notes.find(id=>id!==item.note.id&&host.notes().some(note=>note.id===id))??'';
    host.setPins(item.note.id,other);
    renderContinuity();
    root.querySelector<HTMLElement>('[data-research-compare]')
      ?.scrollIntoView({behavior:'smooth',block:'start'});
    status.textContent='Source selected in its collection. You can read, cite or compare it.';
  }
  function basketCandidates():BookNoteDocumentV1[] {
    const lookup=new Map(host.notes().map(note=>[note.id,note]));
    return host.active()?.noteIds.flatMap(id=>{
      const note=lookup.get(id);
      return note?[note]:[];
    })??[];
  }
  function basketSources():ComparisonSource[] {
    const lookup=new Map(basketCandidates().map(note=>[note.id,note]));
    return basketIds.flatMap(id=>{
      const note=lookup.get(id);
      return note?[{note,bookTitle:host.bookTitle(note.workId)}]:[];
    });
  }
  function renderBasket():void {
    const previous=basketSelect.value;
    const candidates=basketCandidates();
    const present=new Set(candidates.map(note=>note.id));
    basketIds=basketIds.filter(id=>present.has(id));
    basketSelect.replaceChildren(new Option('Choose a collected note…',''));
    for(const note of candidates.filter(note=>!basketIds.includes(note.id)))
      basketSelect.add(new Option(host.bookTitle(note.workId)+' — '+notebookTitle(note),note.id));
    basketSelect.value=[...basketSelect.options].some(o=>o.value===previous)?previous:'';
    basketList.replaceChildren();
    const references=basketSources();
    basketCount.textContent=references.length+' / 6 sources';
    if(!references.length){
      basketList.append(element('p','Add two or more different saved notes, potentially from different books.'));
    }
    for(const [index,source] of references.entries()){
      const row=document.createElement('div');
      row.className='book-notebook__n1p-comparison-item';
      const desc=document.createElement('div');
      desc.append(
        element('strong',(index+1)+'. '+notebookTitle(source.note)),
        element('small',source.bookTitle+' · '+describeResearchSource(source.note.anchor,source.note.chapterKey)),
      );
      row.append(desc,action('Remove',()=>{
        basketIds=basketIds.filter(id=>id!==source.note.id);renderBasket();
      }));
      basketList.append(row);
    }
    $<HTMLButtonElement>('[data-n1p-compare-add]').disabled=!basketSelect.value||basketIds.length>=6;
    basketInsert.disabled=references.length<2||!host.synthesis();
    basketCopy.disabled=references.length<1;
    basketExport.disabled=references.length<2;
  }
  function addToBasket():void {
    const id=basketSelect.value;
    if(!id||basketIds.includes(id))return;
    if(basketIds.length>=6){basketStatus.textContent='The comparison basket holds at most six sources.';return;}
    if(!basketCandidates().some(note=>note.id===id)){
      basketStatus.textContent='That note is no longer available in this collection.';return;
    }
    basketIds.push(id);renderBasket();
    basketStatus.textContent='Source reference added. The original notebook record is unchanged.';
  }
  function insertComparison():void {
    const sources=basketSources();
    if(!host.synthesis()||sources.length<2)return;
    try{
      const markdown=multiSourceComparisonMarkdown(sources);
      const old=host.draft().body;
      const start=writingArea.selectionStart,end=writingArea.selectionEnd;
      const prefix=start>0&&!old.slice(0,start).endsWith('\n')?'\n\n':'';
      const suffix=end<old.length&&!old.slice(end).startsWith('\n')?'\n':'';
      const addition=prefix+markdown+'\n'+suffix;
      const next=old.slice(0,start)+addition+old.slice(end);
      if(next.length>250000){
        basketStatus.textContent='Synthesis Markdown limit reached. Export the current draft before adding more.';
        return;
      }
      host.setDraft(host.draft().title,next);
      writingArea.focus();
      writingArea.setSelectionRange(start+addition.length,start+addition.length);
      basketStatus.textContent='Comparison outline inserted into the native synthesis draft. Save to commit.';
    }catch(error){
      basketStatus.textContent=error instanceof Error?error.message:'Cannot build a comparison outline.';
    }
  }

  function renderContinuity():void {
    const source=selectedSource();
    const collection=host.active();
    const synthesis=host.synthesis();
    const href=source?host.sourceHref(source):undefined;
    openSource.disabled=!source;
    openReader.disabled=!href;
    openSynthesis.disabled=!synthesis;
    focusWriting.disabled=!synthesis;
    saveCopy.disabled=!synthesis;
    copyWorking.disabled=!synthesis;
    openRecovery.disabled=!synthesis;
    const checkpoint=collection&&synthesis
      ?readResearchDraftCheckpoint(collection.id,synthesis.id):undefined;
    info.textContent=collection
      ?collection.name+' · '+collection.noteIds.length+' sources · '
        +(synthesis?'Synthesis revision '+synthesis.revision:'No synthesis')
        +(checkpoint?' · session recovery draft available':'')
      :'Select a collection';
    path.replaceChildren();
    if(!source){
      path.append(element('p','Pin a saved source from the collection to open its book, note and synthesis.'));
      return;
    }
    const text=element('div','');
    text.className='book-notebook__n1p-flow-step';
    text.append(
      element('strong',host.bookTitle(source.workId)),
      element('span',describeResearchSource(source.anchor,source.chapterKey)),
      element('small',notebookTitle(source)),
    );
    const next=element('div','');
    next.className='book-notebook__n1p-flow-step';
    next.append(
      element('strong',collection?.name??'Unassigned research'),
      element('span',synthesis?notebookTitle(synthesis):'Add a native synthesis'),
      element('small',host.isDirty()?'Unsaved writing in this tab':'Saved research notes'),
    );
    path.append(text,element('span','→'),next);
  }
  function onCollectionChanged():void {
    const collectionId=host.active()?.id??'';
    if(collectionId!==lastBasketCollection){
      lastBasketCollection=collectionId;
      basketIds=[];
      basketStatus.textContent='';
    }
    renderCollectionChoices();renderQueue();renderContinuity();renderBasket();
  }
  function onNotesChanged():void {
    renderQueue();renderContinuity();renderBasket();
  }
  function onDraftChanged():void {
    renderContinuity();renderBasket();
  }
  bind('[data-n1p-compare-select]','change',renderBasket);
  bind('[data-n1p-compare-add]','click',addToBasket);
  bind('[data-n1p-compare-clear]','click',()=>{
    basketIds=[];renderBasket();
    basketStatus.textContent='Comparison basket cleared; source notes were unchanged.';
  });
  bind('[data-n1p-compare-insert]','click',insertComparison);
  bind('[data-n1p-compare-copy]','click',()=>{
    const sources=basketSources();
    if(!sources.length)return;
    void navigator.clipboard.writeText(conciseSourceReferences(sources))
      .then(()=>{basketStatus.textContent='Source references copied with recorded locations.';},
        ()=>{basketStatus.textContent='Clipboard unavailable. Open the source notes to copy references.';});
  });
  bind('[data-n1p-compare-export]','click',()=>{
    const collection=host.active(),sources=basketSources();
    if(!collection||sources.length<2){
      basketStatus.textContent='Choose at least two available source notes to export a comparison.';
      return;
    }
    try{
      const outline=multiSourceComparisonMarkdown(sources);
      const markdown=[
        '# Research comparison draft — '+collection.name.replace(/[\r\n#]/g,' ').trim(),
        '',
        '> Manually exported source-backed writing outline, not an authoritative Library note.',
        '> Original book quotations and scholarly claims have not been independently verified.',
        '',
        'Collection ID: '+collection.id,
        'Source count: '+sources.length,
        '',
        outline,'',
      ].join('\n');
      downloadMarkdown('research-comparison-'+safeFile(collection.name)+'.md',markdown);
      basketStatus.textContent='Comparison outline download requested. Notebook notes were not modified.';
    }catch(error){
      basketStatus.textContent=error instanceof Error?error.message:'Comparison export unavailable.';
    }
  });
  bind('[data-n1p-review-collection]','change',renderQueue);
  bind('[data-n1p-review-filter]','change',renderQueue);
  bind('[data-n1p-review-start]','click',()=>{
    const active=host.active();
    if(!active)return;
    const available=new Set(host.notes().map(note=>note.id));
    const ids=active.noteIds.filter(id=>available.has(id));
    if(!ids.length){status.textContent='No available source notes in the current collection.';return;}
    const existing=readResearchSession(active.id);
    if(existing&&!window.confirm(
      'Start a fresh review session for this collection? Existing temporary review flags will reset.'))return;
    const created=newResearchSession(active.id,ids);
    if(!created||!storeResearchSession(created)){
      status.textContent='Unable to store this review queue in the current browser tab.';
      return;
    }
    collectionSelect.value=active.id;
    status.textContent='Review queue started using existing session storage, without modifying notes.';
    host.refreshReview();
    renderQueue();
  });
  bind('[data-n1p-export-review]','click',()=>{
    const text=crossBookReviewPacketMarkdown(loadResearchCollections(),host.notes(),
      host.bookTitle,collectionSelect.value,filter.value as QueueFilter);
    downloadMarkdown('research-review-'+safeFile(collectionSelect.value)
      +'-'+filter.value+'.md',text);
    status.textContent='Review checklist download requested. It contains self-reported flags, not mastery evidence.';
  });
  bind('[data-n1p-go-source]','click',()=>{
    const source=selectedSource();
    if(source)void host.openNote(source);
  });
  bind('[data-n1p-go-reader]','click',()=>{
    const source=selectedSource(),href=source?host.sourceHref(source):undefined;
    if(!href){status.textContent='The original reader link is unavailable for this note.';return;}
    // Keep synthesis and session checkpoints in the current browser tab.
    const link=document.createElement('a');
    link.href=href;link.target='_blank';link.rel='noopener noreferrer';
    link.click();
    status.textContent='Original reader requested in a separate tab. Current synthesis draft remains open.';
  });
  bind('[data-n1p-go-synthesis]','click',()=>{
    const note=host.synthesis();if(note)void host.openNote(note);
  });
  bind('[data-n1p-focus-writing]','click',()=>{
    if(!host.synthesis())return;
    writingArea.focus();
    writingArea.scrollIntoView({behavior:'smooth',block:'center'});
  });
  bind('[data-n1p-recovery-jump]','click',()=>{
    const collection=host.active(),note=host.synthesis();
    if(!collection||!note)return;
    const checkpoint=readResearchDraftCheckpoint(collection.id,note.id);
    const recovery=root.querySelector<HTMLElement>('[data-research-checkpoint-status]');
    recovery?.scrollIntoView({behavior:'smooth',block:'center'});
    if(checkpoint){
      root.querySelector<HTMLButtonElement>('[data-research-restore-checkpoint]')?.focus();
      status.textContent='Session checkpoint found. Restore explicitly, inspect the text, then save through the native notebook.';
    }else{
      root.querySelector<HTMLButtonElement>('[data-research-download-draft]')?.focus();
      status.textContent='No stored tab checkpoint for this synthesis. Download the current writing draft for manual recovery.';
    }
  });
  bind('[data-n1p-copy-working-copy]','click',()=>{
    const synthesis=host.synthesis();
    if(!synthesis)return;
    const draft=host.draft();
    const markdown='# '+draft.title.replace(/[\r\n#]/g,' ').trim()
      +'\n\n'+draft.body+'\n';
    void navigator.clipboard.writeText(markdown)
      .then(()=>{status.textContent='Current writing copied; clipboard text is not a confirmed notebook save.';},
        ()=>{status.textContent='Clipboard unavailable. Download the current draft instead.';});
  });
  bind('[data-n1p-download-working-copy]','click',()=>{
    const collection=host.active(),synthesis=host.synthesis();
    if(!collection||!synthesis)return;
    const draft=host.draft();
    const text=[
      '# '+draft.title.replace(/[\r\n#]/g,' ').trim(),
      '',
      '> Manually downloaded writing draft. NOT a confirmed Library notebook save.',
      '> Source notes and collection data remain in the authoritative Library store.',
      '',
      'Collection ID: '+collection.id,
      'Synthesis note ID: '+synthesis.id,
      'Base notebook revision: '+synthesis.revision,
      'Draft status: '+(host.isDirty()?'unsaved':'matches current local editor baseline'),
      '',draft.body,'',
    ].join('\n');
    downloadMarkdown('research-draft-'+safeFile(collection.name)+'.md',text);
    status.textContent='Working draft download requested. Save through the native notebook to commit changes.';
  });
  onCollectionChanged();
  return {
    onCollectionChanged,onNotesChanged,onDraftChanged,
    dispose(){
      disposed=true;++reviewToken;
      for(const remove of removes)remove();
    },
  };
}
