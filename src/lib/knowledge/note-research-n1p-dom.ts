import {
  multiSourceComparisonMarkdown, conciseSourceReferences, type ComparisonSource,
} from './note-research-n1p-writing';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { noteReferenceMarkdown, extractNotebookLinks } from './note-links';
import { extractNotebookTopics } from './note-workspace';
import { synthesisSectionTemplate } from './note-research-n1r-sections';
import { requestResearchView } from './note-research-n1q-view';
import { readResearchDraftCheckpoint } from './note-research-drafts';
import { getBookNote, listBookNotes } from './note-store';
import { sourceReadingCaptureMarkdown, currentResearchWorkingPacket } from './note-research-n1u-workflows';
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
  const reviewSearch=$<HTMLInputElement>('[data-n1r-review-search]');
  const reviewNext=$<HTMLButtonElement>('[data-n1r-review-next]');
  const reviewFocus=$<HTMLSelectElement>('[data-n1s-review-focus]');
  const info=$<HTMLElement>('[data-n1p-flow-info]');
  const path=$<HTMLElement>('[data-n1p-source-path]');
  const start=$<HTMLButtonElement>('[data-n1p-review-start]');
  const openSource=$<HTMLButtonElement>('[data-n1p-go-source]');
  const openReader=$<HTMLButtonElement>('[data-n1p-go-reader]');
  const openSynthesis=$<HTMLButtonElement>('[data-n1p-go-synthesis]');
  const focusWriting=$<HTMLButtonElement>('[data-n1p-focus-writing]');
  const captureSource=$<HTMLButtonElement>('[data-n1u-capture-source]');
  const citeSection=$<HTMLButtonElement>('[data-n1u-cite-section]');
  const workingPacket=$<HTMLButtonElement>('[data-n1u-working-packet]');
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
  const matchReviewQuery=(item:ResearchQueueItem,query:string[]):boolean=>{
    if(!query.length)return true;
    const words=[
      notebookTitle(item.note),host.bookTitle(item.note.workId),
      item.collectionName,describeResearchSource(item.note.anchor,item.note.chapterKey),
      ...extractNotebookTopics(item.note.bodyMarkdown),
    ].join(' ').normalize('NFKC').toLocaleLowerCase();
    return query.every(term=>words.includes(term));
  };
  function citationContext(){
    const notes=host.notes(),lookup=new Map(notes.map(note=>[note.id,note]));
    const contexts=new Map<string,{links:Set<string>|undefined;multiBook:boolean}>();
    for(const collection of loadResearchCollections()){
      const synthesis=collection.synthesisId
        ?lookup.get(collection.synthesisId):undefined;
      const body=host.active()?.id===collection.id
        ?host.draft().body:synthesis?.bodyMarkdown;
      const books=new Set(collection.noteIds.map(id=>lookup.get(id)?.workId).filter(Boolean));
      contexts.set(collection.id,{
        links:body===undefined?undefined:
          new Set(extractNotebookLinks(body).map(link=>link.id)),
        multiBook:books.size>1,
      });
    }
    return contexts;
  }
  const currentReviewMatches=()=>{
    const words=reviewSearch.value.normalize('NFKC').toLocaleLowerCase()
      .split(/\s+/).filter(Boolean).slice(0,10);
    const contexts=citationContext();
    return collectCrossBookReviewQueue(loadResearchCollections(),host.notes(),
      collectionSelect.value,filter.value as QueueFilter,3600)
      .filter(item=>{
        if(!matchReviewQuery(item,words))return false;
        const context=contexts.get(item.collectionId);
        if(reviewFocus.value==='uncited')return !context?.links?.has(item.note.id);
        if(reviewFocus.value==='cited')return !!context?.links?.has(item.note.id);
        if(reviewFocus.value==='crossbook')return !!context?.multiBook;
        return true;
      });
  };
  function renderQueue():void {
    queue.replaceChildren();
    const collections=loadResearchCollections();
    const notes=host.notes();
    const summary=summarizeCrossBookQueue(collections,notes);
    count.textContent=summary.revisit+' revisit · '+summary.pending+' pending · '
      +summary.reviewed+' reviewed across '+summary.books+' books'
      +(summary.unavailable?' · '+summary.unavailable+' unavailable source(s)':'');
    const filtered=currentReviewMatches();
    reviewNext.disabled=!filtered.some(item=>item.state==='revisit'||item.state==='pending');
    if(!filtered.length){
      queue.append(element('p','No notes in this view. Start a collection session, or change the status filter.'));
      return;
    }
    if(filtered.length>90)
      status.textContent='Showing the first 90 matching review entries of '+filtered.length+'. Narrow the search to reach other sources.';
    const contexts=citationContext();
    for(const item of filtered.slice(0,90)){
      const row=document.createElement('article');
      row.className='book-notebook__n1p-review-entry';
      const name=document.createElement('div');
      name.className='book-notebook__n1p-review-details';
      name.append(
        element('strong',notebookTitle(item.note)),
        element('span',host.bookTitle(item.note.workId)+' · '+item.collectionName),
        element('small',describeResearchSource(item.note.anchor,item.note.chapterKey)),
        element('small',item.state==='revisit'?'Needs revisit':item.state==='reviewed'?'Self-marked reviewed':'Pending'),
        element('small',!contexts.get(item.collectionId)?.links
          ?'No saved synthesis available'
          :contexts.get(item.collectionId)!.links!.has(item.note.id)
            ?'Explicitly linked in synthesis (not claim verification)'
            :'Not linked in current synthesis'),
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
        action('Compare',()=>{void addReviewToBasket(item);}),
        action('Cite in synthesis',()=>{void citeReviewSource(item);}),
        action('Cite in section',()=>{void citeReviewInSection(item);}),
        action('Writing prompt',()=>{void draftReviewPrompt(item);}),
        action('Capture reading',()=>{void captureReviewReading(item);}),
        action('Connections',()=>{
          root.dispatchEvent(new CustomEvent('library-research-discover-related',{
            detail:{noteId:item.note.id},
          }));
          requestResearchView(root,'browse','[data-n1o-quick-results]');
        }),
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
        link.target='_blank';link.rel='noopener noreferrer';
        link.title='Opens the existing book reader in a separate tab; the recorded source location appears on this card.';
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
    requestResearchView(root,'sources','[data-research-compare]');
    root.querySelector<HTMLElement>('[data-research-compare]')
      ?.scrollIntoView({behavior:'smooth',block:'start'});
    status.textContent='Source selected in its collection. You can read, cite or compare it.';
  }
  async function addReviewToBasket(item:ResearchQueueItem):Promise<void> {
    if(host.active()?.id!==item.collectionId)await openReviewSource(item);
    if(disposed||host.active()?.id!==item.collectionId)return;
    if(!basketCandidates().some(note=>note.id===item.note.id)){
      basketStatus.textContent='The source is no longer available in this collection.';
      return;
    }
    if(basketIds.includes(item.note.id)){
      basketStatus.textContent='This source is already in the comparison basket.';
    }else if(basketIds.length>=6){
      basketStatus.textContent='The comparison basket is full. Remove a source before adding another.';
    }else{
      basketIds.push(item.note.id);
      renderBasket();
      basketStatus.textContent='Source added to a collection-aware comparison basket. All note content remains unchanged.';
    }
    requestResearchView(root,'write','[data-n1p-comparison-items]');
    root.querySelector<HTMLElement>('[data-n1p-comparison-items]')
      ?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function citeReviewInSection(item:ResearchQueueItem):Promise<void> {
    if(host.active()?.id!==item.collectionId)await host.openCollection(item.collectionId);
    if(disposed||host.active()?.id!==item.collectionId){
      status.textContent='Collection switch canceled; unsaved writing was retained.';
      return;
    }
    const note=host.notes().find(source=>source.id===item.note.id);
    if(!note||!host.active()?.noteIds.includes(note.id)){
      status.textContent='Saved source unavailable in this collection.';
      return;
    }
    if(!host.synthesis()){
      requestResearchView(root,'write','[data-research-make-synthesis]');
      status.textContent='Create a native synthesis before citing into a heading.';
      return;
    }
    requestResearchView(root,'write','[data-n1r-section-picker]');
    root.dispatchEvent(new CustomEvent('library-research-cite-in-section',{
      detail:{noteId:note.id,collectionId:item.collectionId},
    }));
    status.textContent='Source forwarded to the existing section citation editor. Choose a heading first if requested.';
  }
  async function citeReviewSource(item:ResearchQueueItem):Promise<void> {
    if(host.active()?.id!==item.collectionId)await openReviewSource(item);
    if(disposed||host.active()?.id!==item.collectionId)return;
    const current=host.notes().find(note=>note.id===item.note.id);
    if(!current||!host.active()?.noteIds.includes(current.id)){
      status.textContent='The saved source note is no longer available in this collection.';
      return;
    }
    if(!host.synthesis()){
      status.textContent='Create a native synthesis for this collection before inserting a source reference.';
      requestResearchView(root,'write','[data-research-make-synthesis]');
      root.querySelector<HTMLButtonElement>('[data-research-make-synthesis]')
        ?.scrollIntoView({block:'center',behavior:'smooth'});
      return;
    }
    const reference=[
      noteReferenceMarkdown(current),
      '> Recorded book location: '+describeResearchSource(current.anchor,current.chapterKey),
      '',
    ].join('\n');
    if(insertInDraft(reference)){
      status.textContent='Stable-ID source citation inserted into the synthesis editor. Save explicitly to commit the note revision.';
    }
  }
  async function draftReviewPrompt(item:ResearchQueueItem):Promise<void> {
    if(host.active()?.id!==item.collectionId)await openReviewSource(item);
    if(disposed||host.active()?.id!==item.collectionId)return;
    const note=host.notes().find(candidate=>candidate.id===item.note.id);
    if(!note||!host.active()?.noteIds.includes(note.id)){
      status.textContent='The original saved review source is no longer available.';
      return;
    }
    if(!host.synthesis()){
      requestResearchView(root,'write','[data-research-make-synthesis]');
      status.textContent='Create a native synthesis for this collection before inserting a reading prompt.';
      return;
    }
    if(insertInDraft(synthesisSectionTemplate('reading',note))){
      status.textContent='Source-linked reading takeaway inserted in your current synthesis draft. Review and save explicitly.';
    }
  }
  async function captureReviewReading(item:ResearchQueueItem):Promise<void> {
    if(host.active()?.id!==item.collectionId)await host.openCollection(item.collectionId);
    if(disposed||host.active()?.id!==item.collectionId)return;
    if(!host.synthesis()){
      requestResearchView(root,'write','[data-research-make-synthesis]');
      status.textContent='Create a native synthesis before bringing a review source into writing.';
      return;
    }
    const before=host.draft().body,base=host.synthesis()!.revision;
    const source=await getBookNote(item.note.id).catch(()=>undefined);
    if(disposed||host.active()?.id!==item.collectionId
      ||host.draft().body!==before||host.synthesis()?.revision!==base){
      status.textContent='Writing or collection changed while reading the saved source. Nothing was inserted.';
      return;
    }
    if(!source||!host.active()?.noteIds.includes(source.id)){
      status.textContent='Saved source is unavailable in this collection; no citation was inserted.';
      return;
    }
    if(insertInDraft(sourceReadingCaptureMarkdown(source,host.bookTitle,host.sourceHref)))
      status.textContent='Current saved-note reading capture inserted into the unsaved synthesis draft; verify the original and save explicitly.';
  }
  function insertInDraft(markdown:string):boolean {
    if(!host.synthesis())return false;
    const old=host.draft().body;
    // Queue actions often originate in Review rather than in the editor.
    // Append in that case instead of replacing a stale hidden-textarea selection.
    const caretInsideEditor=document.activeElement===writingArea;
    const from=caretInsideEditor
      ?Math.max(0,Math.min(old.length,writingArea.selectionStart))
      :old.length;
    const to=caretInsideEditor
      ?Math.max(from,Math.min(old.length,writingArea.selectionEnd))
      :old.length;
    const prefix=from>0&&!old.slice(0,from).endsWith('\n')?'\n\n':'';
    const suffix=to<old.length&&!old.slice(to).startsWith('\n')?'\n':'';
    const addition=prefix+markdown.trimEnd()+'\n'+suffix;
    const next=old.slice(0,from)+addition+old.slice(to);
    if(next.length>writingArea.maxLength){
      basketStatus.textContent='This synthesis reached its maximum Markdown length. Download the current draft first.';
      return false;
    }
    host.setDraft(host.draft().title,next);
    requestResearchView(root,'write','[data-research-synthesis-body]');
    writingArea.focus();
    writingArea.setSelectionRange(from+addition.length,from+addition.length);
    return true;
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
    try {
      if(insertInDraft(multiSourceComparisonMarkdown(sources)))
        basketStatus.textContent='Comparison outline inserted into the native synthesis draft. Save to commit its revision.';
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
    captureSource.disabled=!synthesis||!source||!collection?.noteIds.includes(source.id);
    citeSection.disabled=captureSource.disabled;
    workingPacket.disabled=!synthesis||!collection;
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
  bind('[data-n1r-review-search]','input',renderQueue);
  bind('[data-n1s-review-focus]','change',renderQueue);
  bind('[data-n1r-review-next]','click',()=>{
    const next=currentReviewMatches().find(item=>item.state==='revisit'||item.state==='pending');
    if(next)void openReviewSource(next);
    else status.textContent='No pending or revisit sources match this filter.';
  });
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
    requestResearchView(root,'write','[data-research-synthesis-body]');
    writingArea.focus();
    writingArea.scrollIntoView({behavior:'smooth',block:'center'});
  });
  bind('[data-n1u-cite-section]','click',()=>{
    const active=host.active(),source=selectedSource();
    if(!active||!host.synthesis()||!source||!active.noteIds.includes(source.id)){
      status.textContent='Create a synthesis and pin a locally saved source first.';
      return;
    }
    // This event is owned by the existing N1L/N1T section writer. It refuses
    // insertion without a selected destination heading and respects the note limit.
    requestResearchView(root,'write','[data-n1r-section-picker]');
    root.dispatchEvent(new CustomEvent('library-research-cite-in-section',{
      detail:{noteId:source.id,collectionId:active.id},
    }));
    status.textContent='Source sent to the existing section citation writer. Choose a heading if needed, then save explicitly.';
  });
  bind('[data-n1u-capture-source]','click',()=>{
    const collection=host.active(),source=selectedSource();
    if(!collection||!host.synthesis()||!source||!collection.noteIds.includes(source.id)){
      status.textContent='Pin an available collected note and create a native synthesis first.';
      return;
    }
    const draftBefore=host.draft().body,base=host.synthesis()!.revision;
    void getBookNote(source.id).then(saved=>{
      if(!saved||host.active()?.id!==collection.id||!host.active()?.noteIds.includes(saved.id)
        ||host.synthesis()?.revision!==base||host.draft().body!==draftBefore){
        status.textContent='Source or writing changed during reading capture. No draft changes were applied.';
        return;
      }
      if(insertInDraft(sourceReadingCaptureMarkdown(saved,host.bookTitle,host.sourceHref)))
        status.textContent='Current saved-note observations inserted into the native synthesis draft; verify the book and save explicitly.';
    }).catch(()=>{status.textContent='Unable to read authoritative local note. No writing changed.';});
  });
  let workingPacketBusy=false;
  bind('[data-n1u-working-packet]','click',()=>{
    const collection=host.active(),synthesis=host.synthesis();
    if(!collection||!synthesis||workingPacketBusy)return;
    const draft={...host.draft()},base=synthesis.revision,dirty=host.isDirty();
    workingPacketBusy=true;
    void listBookNotes().then(savedNotes=>{
      const current=loadResearchCollections().find(item=>item.id===collection.id);
      if(!current||host.active()?.id!==collection.id
        ||host.synthesis()?.revision!==base
        ||host.draft().title!==draft.title||host.draft().body!==draft.body){
        status.textContent='Workspace changed while preparing the packet. Export canceled; current draft was preserved.';
        return;
      }
      const packet=currentResearchWorkingPacket(current,draft,base,dirty,
        savedNotes,host.bookTitle,host.sourceHref);
      downloadMarkdown('research-working-'+safeFile(current.name)+'.md',packet);
      status.textContent='Current working packet requested with saved source revisions and clearly labeled unsaved writing. Not a V2 backup.';
    }).catch(error=>{
      status.textContent=error instanceof Error?error.message:'Working packet unavailable.';
    }).finally(()=>{workingPacketBusy=false;});
  });
  bind('[data-n1p-recovery-jump]','click',()=>{
    const collection=host.active(),note=host.synthesis();
    if(!collection||!note)return;
    const checkpoint=readResearchDraftCheckpoint(collection.id,note.id);
    const recovery=root.querySelector<HTMLElement>('[data-research-checkpoint-status]');
    requestResearchView(root,'write','[data-research-checkpoint-status]');
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
