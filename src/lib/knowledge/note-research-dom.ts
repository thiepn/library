import { listBookNotes, createBookNote, updateBookNote, getBookNote, subscribeBookNotes } from './note-store';
import { renderNotebookPreview } from './note-preview';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import {
  indexResearchNotes, searchResearchIndex, suggestedResearchSources,
  researchBookFacets, type ResearchSearchIndexEntry,
} from './note-research-discovery';
import { mountResearchN1L, type ResearchN1LController } from './note-research-n1l-dom';
import { mountKnowledgeWorkbench, type KnowledgeWorkbench } from './note-research-n1m-dom';
import { mountResearchN1O, type ResearchN1OController } from './note-research-n1o-dom';
import { mountResearchN1P, type ResearchN1PController } from './note-research-n1p-dom';
import { mountResearchViews, type ResearchViewController } from './note-research-n1q-view';
import { extractNotebookTopics } from './note-workspace';
import { mountResearchRefinements, type ResearchRefinements } from './note-research-n1k-dom';
import { readNotebookContinuity, rememberResearchCollection, orderResearchCollections } from './note-continuity';
import {
  createResearchCollection, deleteResearchCollection, RESEARCH_WORKFLOWS,
  describeResearchSource, exportResearchCollectionIndex, groupedResearchMarkdown,
  importResearchCollectionIndex, loadResearchCollections, researchSynthesisBody,
  setResearchCollectionNotes, updateResearchCollection,
  type ResearchCollection, type ResearchSource,
} from './note-research';

export interface ResearchWorkbenchHost {
  bookTitle(workId: string): string;
  sourceHref(note: BookNoteDocumentV1): string | undefined;
  openNote(note: BookNoteDocumentV1): Promise<void>;
}
export interface ResearchWorkbench {
  refresh(): Promise<void>;
  addNote(noteId: string): Promise<void>;
  addNotes(noteIds: readonly string[]): Promise<void>;
  openCollection(id: string): Promise<void>;
  activeCollectionId(): string;
  dispose(): void;
}
type Side = 'left'|'right';
const ACTIVE_RESEARCH_TAB_KEY='thiepn.library.research.active-tab.v1';
const filename = (value:string) =>
  value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)
  || 'research';
function download(name:string,body:string,kind:string):void {
  const url=URL.createObjectURL(new Blob([body],{type:kind}));
  const link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),10000);
}

export function mountResearchWorkbench(
  root:HTMLElement, host:ResearchWorkbenchHost,
):ResearchWorkbench {
  const $=<T extends HTMLElement>(selector:string):T=>{
    const result=root.querySelector<T>(selector);
    if(!result)throw new Error('Missing research workspace element: '+selector);
    return result;
  };
  const select=$<HTMLSelectElement>('[data-research-select]');
  const base=root.closest<HTMLElement>('[data-notebook-root]')?.dataset.base ?? '/library';
  const noteUrl=(note:BookNoteDocumentV1):string=>{
    const href=new URL(base+'/notebook',window.location.origin);
    href.searchParams.set('work',note.workId);
    href.searchParams.set('note',note.id);
    return href.toString();
  };
  const copyNoteLink=(note:BookNoteDocumentV1)=>{
    void navigator.clipboard.writeText(noteUrl(note))
      .then(()=>notify('Direct Library note link copied.'),
        ()=>notify('Clipboard unavailable. Open the note in the editor to copy its URL.'));
  };
  const summary=$<HTMLElement>('[data-research-summary]');
  const notice=$<HTMLElement>('[data-research-status]');
  const detail=$<HTMLElement>('[data-research-detail]');
  const name=$<HTMLElement>('[data-research-name]');
  const description=$<HTMLElement>('[data-research-description]');
  const newName=$<HTMLInputElement>('[data-research-new-name]');
  const newDescription=$<HTMLInputElement>('[data-research-new-description]');
  const newWorkflow=$<HTMLSelectElement>('[data-research-new-workflow]');
  const search=$<HTMLInputElement>('[data-research-find]');
  const searchBook=$<HTMLSelectElement>('[data-research-search-book]');
  const searchCount=$<HTMLElement>('[data-research-search-count]');
  const suggestions=$<HTMLElement>('[data-research-suggestions]');
  const results=$<HTMLElement>('[data-research-search-results]');
  const sourcesList=$<HTMLElement>('[data-research-sources]');
  const sourceFilter=$<HTMLInputElement>('[data-research-filter-sources]');
  const sourceFilterCount=$<HTMLElement>('[data-research-source-filter-count]');
  const indexFile=$<HTMLInputElement>('[data-research-index-file]');
  const synthState=$<HTMLElement>('[data-research-synthesis-state]');
  const synthTitle=$<HTMLInputElement>('[data-research-synthesis-title]');
  const synthBody=$<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const makeSynth=$<HTMLButtonElement>('[data-research-make-synthesis]');
  const saveSynth=$<HTMLButtonElement>('[data-research-save-synthesis]');
  const openSynth=$<HTMLButtonElement>('[data-research-open-synthesis]');
  const reloadSynth=$<HTMLButtonElement>('[data-research-reload-synthesis]');
  const slots={
    left:{
      caption:$<HTMLElement>('[data-research-left-caption]'),
      content:$<HTMLElement>('[data-research-left-preview]'),
      actions:$<HTMLElement>('[data-research-left-actions]'),
    },
    right:{
      caption:$<HTMLElement>('[data-research-right-caption]'),
      content:$<HTMLElement>('[data-research-right-preview]'),
      actions:$<HTMLElement>('[data-research-right-actions]'),
    },
  };
  let all:BookNoteDocumentV1[]=[];
  let activeId='';
  let active:ResearchCollection|undefined;
  let synthesis:BookNoteDocumentV1|undefined;
  let savedTitle='',savedBody='';
  let pins:Record<Side,string>={left:'',right:''};
  let disposed=false,revision=0;
  let busy=false;
  let refinements:ResearchRefinements | undefined;
  let sessionControls:ResearchN1LController | undefined;
  let knowledge:KnowledgeWorkbench | undefined;
  let workflow:ResearchN1OController | undefined;
  let integration:ResearchN1PController | undefined;
  let views:ResearchViewController | undefined;
  let searchIndex:ResearchSearchIndexEntry[]=[];
  const events:Array<()=>void>=[];
  const notify=(message:string)=>{notice.textContent=message;};
  const el=(tag:string,text?:string):HTMLElement=>{
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const button=(text:string,callback:()=>void):HTMLButtonElement=>{
    const node=document.createElement('button');
    node.type='button';node.textContent=text;
    node.addEventListener('click',callback);
    return node;
  };
  const bind=(selector:string,type:string,cb:EventListener)=>{
    const control=$(selector);
    control.addEventListener(type,cb);
    events.push(()=>control.removeEventListener(type,cb));
  };
  const dirty=()=>!!synthesis && (synthTitle.value!==savedTitle || synthBody.value!==savedBody);
  const adoptSynthesis=(note:BookNoteDocumentV1|undefined)=>{
    synthesis=note;
    savedTitle=note?.title??'';savedBody=note?.bodyMarkdown??'';
    synthTitle.value=savedTitle;synthBody.value=savedBody;
  };
  const guardSwitch=():boolean=>{
    if(!dirty())return true;
    return window.confirm('The research synthesis has unsaved changes. Leave this collection without saving them?');
  };
  const sources=():ResearchSource[]=>all.map(note=>({
    note, bookTitle:host.bookTitle(note.workId),
    sourceLocation:describeResearchSource(note.anchor,note.chapterKey),
    sourceHref:host.sourceHref(note),
  }));
  const byId=(id:string)=>all.find(n=>n.id===id);
  const available=()=>active?.noteIds.map(byId).filter((n):n is BookNoteDocumentV1=>!!n)??[];
  const setStatusBusy=(value:boolean)=>{busy=value;saveSynth.disabled=value||!synthesis||!dirty();};

  function renderSelector():void {
    const items=orderResearchCollections(loadResearchCollections());
    const last=activeId;
    select.replaceChildren(new Option('Choose a collection…',''));
    for(const c of items)select.add(new Option(c.name+' ('+c.noteIds.length+' notes)',c.id));
    select.value=items.some(c=>c.id===last)?last:'';
    summary.textContent=items.length+' collections on this browser';
  }
  function renderSynthesis():void {
    const canCreate=!!active && !synthesis && !!available().length;
    makeSynth.hidden=!!synthesis;
    makeSynth.disabled=!canCreate||busy;
    synthTitle.disabled=!synthesis||busy;
    synthBody.disabled=!synthesis||busy;
    saveSynth.disabled=!synthesis||!dirty()||busy;
    openSynth.disabled=!synthesis||busy;
    reloadSynth.disabled=!synthesis||busy;
    if(!synthesis) {
      synthTitle.value='';synthBody.value='';savedTitle='';savedBody='';
      synthState.textContent=available().length
        ? 'Create a native note when ready' : 'Add a saved source before creating a synthesis';
      return;
    }
    if(dirty()) {
      synthState.textContent='Unsaved changes — save before switching or exporting';
      return;
    }
    synthTitle.value=synthesis.title;
    synthBody.value=synthesis.bodyMarkdown;
    savedTitle=synthesis.title;
    savedBody=synthesis.bodyMarkdown;
    synthState.textContent='Native notebook note · revision '+synthesis.revision;
  }
  function openSourceLink(note:BookNoteDocumentV1):HTMLElement {
    const href=host.sourceHref(note);
    if(!href)return el('span','Original reader unavailable on this device');
    const anchor=document.createElement('a');
    anchor.href=href;
    anchor.textContent='Open book';
    anchor.title='Open original book. Location is recorded separately; automatic exact-page jump is not asserted.';
    return anchor;
  }
  function renderSide(side:Side):void {
    const slot=slots[side];
    slot.content.replaceChildren();slot.actions.replaceChildren();
    const note=byId(pins[side]);
    if(!note || !active?.noteIds.includes(note.id)){
      slot.caption.textContent='Pin a source from the list below';
      slot.content.append(el('p','No source selected.'));
      return;
    }
    slot.caption.textContent=notebookTitle(note)+' · '+host.bookTitle(note.workId);
    renderNotebookPreview(slot.content,note.bodyMarkdown,{
      notes:all,
      onOpenNote:linked=>{void host.openNote(linked);},
    });
    const details=el('p',describeResearchSource(note.anchor,note.chapterKey));
    details.className='micro';
    slot.actions.append(details,
      button('Edit note',()=>{void host.openNote(note);}),
      openSourceLink(note),
      button('Copy note link',()=>copyNoteLink(note)),
      button('Copy reference',()=>{
        const copy=host.bookTitle(note.workId)+'\n'
          +describeResearchSource(note.anchor,note.chapterKey)+'\nNote ID: '+note.id;
        void navigator.clipboard.writeText(copy).then(()=>notify('Source reference copied.'),
          ()=>notify('Clipboard unavailable. You can copy the source information above.'));
      }),
    );
  }
  function renderSources():void {
    sourcesList.replaceChildren();
    if(!active){sourceFilterCount.textContent='';return;}
    if(!active.noteIds.length){
      sourcesList.append(el('p','No collected notes yet. Search above or add a note from cross-book discovery.'));
      return;
    }
    const query=sourceFilter.value.normalize('NFKC').trim().toLocaleLowerCase();
    const shown=active.noteIds.filter(id=>{
      if(!query)return true;
      const note=byId(id);
      return !note?id.toLocaleLowerCase().includes(query):[
        notebookTitle(note),host.bookTitle(note.workId),note.chapterKey??'',
        extractNotebookTopics(note.bodyMarkdown).join(' '),note.bodyMarkdown.slice(0,5000),
      ].join(' ').normalize('NFKC').toLocaleLowerCase().includes(query);
    });
    sourceFilterCount.textContent=shown.length+' / '+active.noteIds.length+' source notes shown';
    if(!shown.length){
      sourcesList.append(el('p','No sources match this collection filter.'));
      return;
    }
    for(const id of shown) {
      const note=byId(id);
      const row=el('div');row.className='book-notebook__research-source';
      const label=el('div');label.className='book-notebook__research-source-label';
      label.append(el('strong',note?notebookTitle(note):'Unavailable source'),
        el('span',note?host.bookTitle(note.workId)+' · '+
          describeResearchSource(note.anchor,note.chapterKey):'Missing local note ID: '+id));
      const actions=el('div');actions.className='book-notebook__research-source-actions';
      if(note) {
        actions.append(
          button(pins.left===id?'Pinned A':'Pin A',()=>{
            pins.left=id;renderSources();renderSide('left');
            refinements?.onNotesChanged();workflow?.onNotesChanged();integration?.onNotesChanged();
          }),
          button(pins.right===id?'Pinned B':'Pin B',()=>{
            pins.right=id;renderSources();renderSide('right');
            refinements?.onNotesChanged();workflow?.onNotesChanged();integration?.onNotesChanged();
          }),
          button('Edit',()=>{void host.openNote(note);}),
          button('Copy link',()=>copyNoteLink(note)),
        );
      }
      const move=(direction:-1|1)=>{
        if(!active)return;
        const index=active.noteIds.indexOf(id), next=index+direction;
        if(next<0||next>=active.noteIds.length)return;
        try {
          const ids=[...active.noteIds];
          [ids[index],ids[next]]=[ids[next],ids[index]];
          active=setResearchCollectionNotes(active.id,ids);
          renderDetail();notify('Source order updated for this collection.');
        } catch(error){notify(error instanceof Error?error.message:'Cannot reorder sources.');}
      };
      if(active.noteIds.indexOf(id)>0)actions.append(button('↑ Earlier',()=>move(-1)));
      if(active.noteIds.indexOf(id)<active.noteIds.length-1)
        actions.append(button('↓ Later',()=>move(1)));
      actions.append(button('Remove',()=>{
        if(!active)return;
        try {
          active=setResearchCollectionNotes(active.id,active.noteIds.filter(item=>item!==id));
          if(pins.left===id)pins.left='';
          if(pins.right===id)pins.right='';
          renderDetail();notify('Removed from collection; the original notebook note remains unchanged.');
        } catch(error){notify(error instanceof Error?error.message:'Unable to remove source.');}
      }));
      row.append(label,actions);sourcesList.append(row);
    }
  }
  function renderSearch():void {
    results.replaceChildren();
    if(!active){searchCount.textContent='';return;}
    const query=search.value.trim();
    const excluded=new Set(active.noteIds);
    const candidates=query
      ? searchResearchIndex(searchIndex,query,excluded,searchBook.value,30):[];
    searchCount.textContent=candidates.length
      ? candidates.length+' ranked results'
      :query?'No matching uncollected notes':'Search your local saved notes';
    if(!query){
      results.append(el('p','Search note titles, chapters, topics, book names, and text.'));
      return;
    }
    if(!candidates.length){results.append(el('p','No additional matching notes.'));return;}
    for(const item of candidates){
      const note=item.note;
      const row=el('div');row.className='book-notebook__research-result';
      const detail=el('div');
      const name=el('strong',notebookTitle(note)+' · '+host.bookTitle(note.workId));
      const snippet=el('small',note.bodyMarkdown.replace(/\s+/g,' ').slice(0,120));
      detail.append(name,snippet);
      row.append(detail,button('Add source',()=>{void addNote(note.id);}));
      results.append(row);
    }
  }
  function renderSuggestions():void {
    suggestions.replaceChildren();
    if(!active)return;
    const candidates=suggestedResearchSources(active,searchIndex,12);
    if(!candidates.length){
      suggestions.append(el('p','Suggestions appear when saved notes explicitly link to collected notes or share topic markers.'));
      return;
    }
    for(const item of candidates){
      const row=el('div');row.className='book-notebook__research-result';
      const detail=el('div');
      detail.append(
        el('strong',notebookTitle(item.note)+' · '+host.bookTitle(item.note.workId)),
        el('small',item.reasons.join(' · ')),
      );
      row.append(detail,button('Collect',()=>{void addNote(item.note.id);}));
      suggestions.append(row);
    }
  }
  function renderBookFacets():void {
    const previous=searchBook.value;
    searchBook.replaceChildren(new Option('Every book','all'));
    for(const facet of researchBookFacets(searchIndex)){
      searchBook.add(new Option(host.bookTitle(facet.workId)+' ('+facet.count+')',facet.workId));
    }
    searchBook.value=[...searchBook.options].some(option=>option.value===previous)
      ?previous:'all';
  }
  function renderDetail():void {
    renderSelector();
    active=loadResearchCollections().find(c=>c.id===activeId);
    detail.hidden=!active;
    if(!active){sourcesList.replaceChildren();return;}
    name.textContent=active.name;
    description.textContent=(active.description||'No project description')+' · Workflow: '
      +(RESEARCH_WORKFLOWS.find(w=>w.id===active?.workflowId)?.label??'Open research');
    renderSources();renderSearch();renderSuggestions();renderSide('left');renderSide('right');renderSynthesis();
    refinements?.onNotesChanged();
    refinements?.onSynthesisChanged();
    sessionControls?.onNotesChanged();
    knowledge?.onNotesChanged();
    workflow?.onNotesChanged();
    integration?.onNotesChanged();
    views?.onNotesChanged();
  }
  async function activate(id:string,force=false):Promise<void> {
    if(!force && id!==activeId && !guardSwitch()){
      select.value=activeId;return;
    }
    activeId=id;pins={left:'',right:''};adoptSynthesis(undefined);
    if(id)rememberResearchCollection(id);
    try {
      if(id)sessionStorage.setItem(ACTIVE_RESEARCH_TAB_KEY,id);
      else sessionStorage.removeItem(ACTIVE_RESEARCH_TAB_KEY);
    } catch { /* An unavailable tab store must not block research work. */ }
    active=loadResearchCollections().find(c=>c.id===id);
    if(active){
      pins.left=available()[0]?.id??'';
      pins.right=available()[1]?.id??'';
      if(active.synthesisId)adoptSynthesis(await getBookNote(active.synthesisId));
    }
    renderDetail();
    refinements?.onCollectionChanged();
    sessionControls?.onCollectionChanged();
    knowledge?.onCollectionChanged();
    workflow?.onCollectionChanged();
    integration?.onCollectionChanged();
    views?.onCollectionChanged();
  }
  async function addNotes(noteIds:readonly string[]):Promise<void> {
    if(!active){notify('Create or select a collection first.');root.scrollIntoView({behavior:'smooth'});return;}
    // A freshly saved note can reach this action before a broadcast refresh.
    // Read missing IDs directly from the authoritative IndexedDB note store.
    for(const id of [...new Set(noteIds)]) {
      if(byId(id))continue;
      const fresh=await getBookNote(id).catch(()=>undefined);
      if(fresh)all=[...all.filter(note=>note.id!==id),fresh];
    }
    const unique=[...new Set(noteIds)].filter(id=>!!byId(id) && !active!.noteIds.includes(id));
    if(!unique.length){notify('All selected source notes are already collected or unavailable.');return;}
    try {
      const previous=active.noteIds.length;
      active=setResearchCollectionNotes(active.id,[...active.noteIds,...unique]);
      if(!pins.left)pins.left=active.noteIds[0]??'';
      if(!pins.right)pins.right=active.noteIds[1]??'';
      renderDetail();
      notify((active.noteIds.length-previous)+' notes added to '+active.name+'. Original notes remain unchanged.');
    } catch(error){notify(error instanceof Error?error.message:'Unable to collect sources.');}
  }
  async function addNote(noteId:string):Promise<void> {
    return addNotes([noteId]);
  }
  async function refresh():Promise<void> {
    const token=++revision;
    try {
      const fetched=await listBookNotes();
      if(disposed||token!==revision)return;
      all=fetched;
      searchIndex=indexResearchNotes(all,host.bookTitle);
      renderBookFacets();
      if(!activeId){
        let recent='';
        try{recent=sessionStorage.getItem(ACTIVE_RESEARCH_TAB_KEY)??'';}catch{}
        if(!recent)recent=readNotebookContinuity().lastCollectionId;
        if(recent && loadResearchCollections().some(c=>c.id===recent)){
          await activate(recent,true);
          return;
        }
      }
      const localActive=loadResearchCollections().find(c=>c.id===activeId);
      if(activeId && !localActive)activeId='';
      if(localActive?.synthesisId) {
        const fresh=all.find(n=>n.id===localActive.synthesisId);
        if(fresh && (!synthesis || !dirty()))adoptSynthesis(fresh);
        else if(fresh && synthesis && fresh.revision!==synthesis.revision && dirty())
          synthState.textContent='This synthesis changed in another tab. Export your draft or reload.';
      }
      renderDetail();
    } catch(error){notify(error instanceof Error?error.message:'Unable to load notebook notes.');}
  }

  bind('[data-research-create]','click',()=>{
    if(!guardSwitch())return;
    try {
      const created=createResearchCollection(newName.value,newDescription.value,newWorkflow.value);
      newName.value='';newDescription.value='';newWorkflow.value='open-research';
      void activate(created.id,true).then(()=>notify('Collection created locally. Add source notes to begin.'));
    } catch(error){notify(error instanceof Error?error.message:'Unable to create collection.');}
  });
  bind('[data-research-select]','change',()=>{void activate(select.value);});
  bind('[data-research-find]','input',()=>renderSearch());
  bind('[data-research-search-book]','change',()=>renderSearch());
  bind('[data-research-filter-sources]','input',()=>renderSources());
  bind('[data-research-delete]','click',()=>{
    if(!active || !guardSwitch())return;
    if(!window.confirm('Remove this research collection? Your original notes and synthesis are not deleted.'))return;
    try {
      deleteResearchCollection(active.id);
      void activate('',true).then(()=>notify('Collection removed. Native notebook notes remain intact.'));
    } catch(error){notify(error instanceof Error?error.message:'Unable to remove collection.');}
  });
  bind('[data-research-export-index]','click',()=>{
    try {
      download('thiepn-library-research-collections.json',exportResearchCollectionIndex(),
        'application/json;charset=utf-8');
      notify('Collection index download requested. Export your Library V2 backup separately for note content.');
    } catch(error){notify(error instanceof Error?error.message:'Export failed.');}
  });
  bind('[data-research-import-index]','click',()=>indexFile.click());
  bind('[data-research-index-file]','change',()=>{
    const file=indexFile.files?.[0];indexFile.value='';
    if(!file)return;
    if(file.size>250_000){notify('Collection index exceeds the 250 KB import limit.');return;}
    void file.text().then(raw=>{
      if(!guardSwitch())return;
      const merged=importResearchCollectionIndex(raw);
      renderDetail();
      notify('Imported '+merged.length+' collection definitions. Only local references were imported; note content must be restored separately.');
    }).catch(error=>notify(error instanceof Error?error.message:'Invalid collection index.'));
  });
  bind('[data-research-export-markdown]','click',()=>{
    if(!active)return;
    if(dirty()){notify('Save your synthesis first so the export includes current writing.');return;}
    const text=groupedResearchMarkdown(active,sources(),synthesis);
    download('research-'+filename(active.name)+'.md',text,'text/markdown;charset=utf-8');
    notify('Grouped Markdown download requested with note IDs and recorded source locations.');
  });
  bind('[data-research-make-synthesis]','click',()=>{
    if(!active || busy || synthesis)return;
    const sourceNotes=available();
    const first=sourceNotes[0];
    if(!first){notify('Add at least one available source note before creating a synthesis.');return;}
    if(!window.confirm('Create a native Library reading note containing links to this collection’s sources?'))return;
    setStatusBusy(true);
    const collection=active;
    void createBookNote({
      workId:first.workId,scope:'reading-note',
      title:('Research: '+collection.name).slice(0,200),
      bodyMarkdown:researchSynthesisBody(collection,sources().filter(s=>collection.noteIds.includes(s.note.id))),
    }).then(note=>{
      updateResearchCollection(collection.id,c=>({...c,synthesisId:note.id}));
      adoptSynthesis(note);
      renderDetail();
      notify('Research synthesis created as a native, revision-controlled Library note.');
    }).catch(error=>notify(error instanceof Error?error.message:'Could not create synthesis.'))
      .finally(()=>{setStatusBusy(false);});
  });
  const synthInput=()=>{
    if(!synthesis)return;
    saveSynth.disabled=!dirty()||busy;
    synthState.textContent=dirty()?'Unsaved synthesis edits':'Saved locally · revision '+synthesis.revision;
    refinements?.onDraftEdited();
    sessionControls?.onDraftChanged();
    knowledge?.onDraftChanged();
    workflow?.onDraftChanged();
    integration?.onDraftChanged();
    views?.onDraftChanged();
  };
  bind('[data-research-synthesis-title]','input',synthInput);
  bind('[data-research-synthesis-body]','input',synthInput);
  bind('[data-research-save-synthesis]','click',()=>{
    if(!synthesis || busy || !dirty())return;
    const current=synthesis;
    const title=synthTitle.value,body=synthBody.value;
    setStatusBusy(true);
    void updateBookNote(current.id,current.revision,{title,bodyMarkdown:body})
      .then(saved=>{
        adoptSynthesis(saved);
        refinements?.onSynthesisSaved();
        sessionControls?.onSaved();
        knowledge?.onDraftChanged();
        workflow?.onDraftChanged();
        integration?.onDraftChanged();
        views?.onDraftChanged();
        synthState.textContent='Saved locally · revision '+saved.revision;
        notify('Synthesis saved to your authoritative Library notebook.');
      })
      .catch(error=>{
        synthState.textContent='Save blocked; your edited text remains in this workspace.';
        notify(error instanceof Error?error.message:'Cannot save the synthesis.');
      }).finally(()=>setStatusBusy(false));
  });
  bind('[data-research-open-synthesis]','click',()=>{
    if(!synthesis)return;
    if(!guardSwitch())return;
    void host.openNote(synthesis);
  });
  bind('[data-research-reload-synthesis]','click',()=>{
    if(!synthesis)return;
    if(dirty()&&!window.confirm('Discard unsaved synthesis text and reload the last saved note?'))return;
    void getBookNote(synthesis.id).then(fresh=>{
      if(!fresh){notify('The native synthesis note is no longer available.');return;}
      adoptSynthesis(fresh);
      renderSynthesis();
      notify('Reloaded the last saved synthesis revision.');
    }).catch(error=>notify(error instanceof Error?error.message:'Reload unavailable.'));
  });
  const beforeUnload=(event:BeforeUnloadEvent)=>{
    if(dirty()){event.preventDefault();event.returnValue='';}
  };
  window.addEventListener('beforeunload',beforeUnload);
  const unsubscribe=subscribeBookNotes(()=>{void refresh();});
  refinements=mountResearchRefinements(root,{
    active:()=>active,
    notes:()=>all,
    synthesis:()=>synthesis,
    title:()=>synthTitle.value,
    body:()=>synthBody.value,
    setDraft:(title,body)=>{
      synthTitle.value=title;synthBody.value=body;
      synthInput();
    },
    sourceHref:note=>host.sourceHref(note),
    bookTitle:workId=>host.bookTitle(workId),
    openNote:note=>host.openNote(note),
    pins:()=>({...pins}),
    setPins:(left,right)=>{
      pins={left,right};
      renderSources();renderSide('left');renderSide('right');
    },
    activateCollection:id=>activate(id),
    notify,
  });
  sessionControls=mountResearchN1L(root,{
    active:()=>active,
    notes:()=>all,
    synthesis:()=>synthesis,
    getDraft:()=>({title:synthTitle.value,body:synthBody.value}),
    isDirty:()=>dirty(),
    setDraft:(title,body)=>{
      synthTitle.value=title;synthBody.value=body;
      synthInput();
    },
    pins:()=>({...pins}),
    setPins:(left,right)=>{
      pins={left,right};
      renderSources();renderSide('left');renderSide('right');
      refinements?.onNotesChanged();
    },
    bookTitle:workId=>host.bookTitle(workId),
    sourceHref:note=>host.sourceHref(note),
    openNote:note=>host.openNote(note),
    notify,
  });
  knowledge=mountKnowledgeWorkbench(root,{
    active:()=>active,
    notes:()=>all,
    synthesis:()=>synthesis,
    draft:()=>({title:synthTitle.value,body:synthBody.value}),
    isDirty:()=>dirty(),
    setDraft:(title,body)=>{
      synthTitle.value=title;synthBody.value=body;synthInput();
    },
    bookTitle:workId=>host.bookTitle(workId),
    sourceHref:note=>host.sourceHref(note),
    openNote:note=>host.openNote(note),
    chooseCollection:id=>activate(id),
    pinSource:id=>{
      const second=pins.right!==id
        ?pins.right:(active?.noteIds.find(other=>other!==id)??'');
      pins={left:id,right:second};
      renderSources();renderSide('left');renderSide('right');
      refinements?.onNotesChanged();
    },
    notify,
  });
  workflow=mountResearchN1O(root,{
    active:()=>active,
    notes:()=>all,
    synthesis:()=>synthesis,
    draft:()=>({title:synthTitle.value,body:synthBody.value}),
    isDirty:()=>dirty(),
    setDraft:(title,body)=>{
      synthTitle.value=title;synthBody.value=body;
      synthInput();
    },
    pins:()=>({...pins}),
    bookTitle:id=>host.bookTitle(id),
    sourceHref:note=>host.sourceHref(note),
    openNote:note=>host.openNote(note),
    openCollection:id=>activate(id),
    collectNote:id=>addNote(id),
    notify,
  });
  integration=mountResearchN1P(root,{
    active:()=>active,
    notes:()=>all,
    synthesis:()=>synthesis,
    draft:()=>({title:synthTitle.value,body:synthBody.value}),
    setDraft:(title,body)=>{
      synthTitle.value=title;synthBody.value=body;
      synthInput();
    },
    isDirty:()=>dirty(),
    pins:()=>({...pins}),
    setPins:(left,right)=>{
      pins={left,right};
      renderSources();renderSide('left');renderSide('right');
      refinements?.onNotesChanged();workflow?.onNotesChanged();
    },
    openNote:note=>host.openNote(note),
    openCollection:id=>activate(id),
    sourceHref:note=>host.sourceHref(note),
    bookTitle:id=>host.bookTitle(id),
    refreshReview:()=>sessionControls?.onCollectionChanged(),
    notify,
  });
  views=mountResearchViews(root,{
    active:()=>active,
    synthesis:()=>synthesis,
    dirty,
    notes:()=>all,
    draft:()=>({title:synthTitle.value,body:synthBody.value}),
    setDraft:(title,body)=>{
      synthTitle.value=title;synthBody.value=body;synthInput();
    },
    openNote:note=>host.openNote(note),
    pinSource:id=>{
      if(!active?.noteIds.includes(id))return;
      pins.left=id;
      if(pins.right===id)
        pins.right=active.noteIds.find(other=>other!==id)??'';
      renderSources();renderSide('left');renderSide('right');
      refinements?.onNotesChanged();workflow?.onNotesChanged();
      integration?.onNotesChanged();
    },
    bookTitle:workId=>host.bookTitle(workId),
    sourceHref:note=>host.sourceHref(note),
  });
  void refresh();
  return {
    refresh,addNote,addNotes,
    openCollection:id=>activate(id),
    activeCollectionId:()=>activeId,
    dispose(){
      disposed=true;
      for(const off of events)off();
      unsubscribe();
      refinements?.dispose();
      sessionControls?.dispose();
      knowledge?.dispose();
      workflow?.dispose();
      integration?.dispose();
      views?.dispose();
      window.removeEventListener('beforeunload',beforeUnload);
    },
  };
}
