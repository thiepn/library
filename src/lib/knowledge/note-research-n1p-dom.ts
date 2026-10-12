import { listBookNotes } from './note-store';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { loadResearchCollections, describeResearchSource,
  type ResearchCollection } from './note-research';
import {
  collectCrossBookReviewQueue, summarizeCrossBookQueue,
  updateCrossBookReviewState, type QueueFilter, type ResearchQueueItem,
} from './note-cross-book-review';
import { readResearchSession, newResearchSession, storeResearchSession } from './note-research-session';
import { orderResearchCollections } from './note-continuity';

export interface ResearchN1PHost {
  active():ResearchCollection|undefined;
  notes():readonly BookNoteDocumentV1[];
  synthesis():BookNoteDocumentV1|undefined;
  draft():{title:string;body:string};
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
  const writingArea=$<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const removes:Array<()=>void>=[];
  let disposed=false;
  let reviewToken=0;
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
      +summary.reviewed+' reviewed across '+summary.books+' books';
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
        action('Reviewed',()=>process('reviewed')),
        action('Revisit',()=>process('revisit')),
      );
      if(item.state!=='pending')controls.append(action('Reset',()=>process('pending')));
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
    info.textContent=collection
      ?collection.name+' · '+collection.noteIds.length+' sources · '
        +(synthesis?'Synthesis revision '+synthesis.revision:'No synthesis')
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
    renderCollectionChoices();renderQueue();renderContinuity();
  }
  function onNotesChanged():void {
    renderQueue();renderContinuity();
  }
  function onDraftChanged():void {
    renderContinuity();
  }
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
  bind('[data-n1p-go-source]','click',()=>{
    const source=selectedSource();
    if(source)void host.openNote(source);
  });
  bind('[data-n1p-go-reader]','click',()=>{
    const source=selectedSource(),href=source?host.sourceHref(source):undefined;
    if(!href){status.textContent='The original reader link is unavailable for this note.';return;}
    if(host.isDirty()&&!window.confirm(
      'Your synthesis has unsaved edits. Download a draft copy before leaving? Choose Cancel to stay.'))return;
    window.location.assign(href);
  });
  bind('[data-n1p-go-synthesis]','click',()=>{
    const note=host.synthesis();if(note)void host.openNote(note);
  });
  bind('[data-n1p-focus-writing]','click',()=>{
    if(!host.synthesis())return;
    writingArea.focus();
    writingArea.scrollIntoView({behavior:'smooth',block:'center'});
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
