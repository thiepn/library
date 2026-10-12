import { listBookNotes, createBookNote, updateBookNote, getBookNote, subscribeBookNotes } from './note-store';
import { renderNotebookPreview } from './note-preview';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { findNotebookNotes } from './note-links';
import {
  createResearchCollection, deleteResearchCollection,
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
  dispose(): void;
}
type Side = 'left'|'right';
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
  const summary=$<HTMLElement>('[data-research-summary]');
  const notice=$<HTMLElement>('[data-research-status]');
  const detail=$<HTMLElement>('[data-research-detail]');
  const name=$<HTMLElement>('[data-research-name]');
  const description=$<HTMLElement>('[data-research-description]');
  const newName=$<HTMLInputElement>('[data-research-new-name]');
  const newDescription=$<HTMLInputElement>('[data-research-new-description]');
  const search=$<HTMLInputElement>('[data-research-find]');
  const results=$<HTMLElement>('[data-research-search-results]');
  const sourcesList=$<HTMLElement>('[data-research-sources]');
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
    const items=loadResearchCollections();
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
    if(!active)return;
    if(!active.noteIds.length){
      sourcesList.append(el('p','No collected notes yet. Search above or add a note from cross-book discovery.'));
      return;
    }
    for(const id of active.noteIds) {
      const note=byId(id);
      const row=el('div');row.className='book-notebook__research-source';
      const label=el('div');label.className='book-notebook__research-source-label';
      label.append(el('strong',note?notebookTitle(note):'Unavailable source'),
        el('span',note?host.bookTitle(note.workId)+' · '+
          describeResearchSource(note.anchor,note.chapterKey):'Missing local note ID: '+id));
      const actions=el('div');actions.className='book-notebook__research-source-actions';
      if(note) {
        actions.append(
          button(pins.left===id?'Pinned A':'Pin A',()=>{pins.left=id;renderSources();renderSide('left');}),
          button(pins.right===id?'Pinned B':'Pin B',()=>{pins.right=id;renderSources();renderSide('right');}),
          button('Edit',()=>{void host.openNote(note);}),
        );
      }
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
    if(!active)return;
    const query=search.value.trim();
    if(!query){results.append(el('p','Search all notebook notes to add sources.'));return;}
    const matches=findNotebookNotes(all,host.bookTitle,query,18).filter(n=>!active?.noteIds.includes(n.id));
    if(!matches.length){results.append(el('p','No additional matching notes.'));return;}
    for(const note of matches){
      const row=el('div');row.className='book-notebook__research-result';
      const label=el('span',notebookTitle(note)+' · '+host.bookTitle(note.workId));
      row.append(label,button('Add source',()=>{void addNote(note.id);}));
      results.append(row);
    }
  }
  function renderDetail():void {
    renderSelector();
    active=loadResearchCollections().find(c=>c.id===activeId);
    detail.hidden=!active;
    if(!active){sourcesList.replaceChildren();return;}
    name.textContent=active.name;
    description.textContent=active.description||'No project description';
    renderSources();renderSearch();renderSide('left');renderSide('right');renderSynthesis();
  }
  async function activate(id:string,force=false):Promise<void> {
    if(!force && id!==activeId && !guardSwitch()){
      select.value=activeId;return;
    }
    activeId=id;pins={left:'',right:''};synthesis=undefined;
    active=loadResearchCollections().find(c=>c.id===id);
    if(active){
      pins.left=available()[0]?.id??'';
      pins.right=available()[1]?.id??'';
      if(active.synthesisId)synthesis=await getBookNote(active.synthesisId);
    }
    renderDetail();
  }
  async function addNote(noteId:string):Promise<void> {
    if(!active){notify('Create or select a collection first.');root.scrollIntoView({behavior:'smooth'});return;}
    if(!byId(noteId)){notify('The selected note is unavailable on this device.');return;}
    try {
      if(active.noteIds.includes(noteId)){notify('This note is already in the collection.');return;}
      active=setResearchCollectionNotes(active.id,[...active.noteIds,noteId]);
      if(!pins.left)pins.left=noteId;
      else if(!pins.right)pins.right=noteId;
      renderDetail();notify('Added to '+active.name+'. The original note was not changed.');
    } catch(error){notify(error instanceof Error?error.message:'Unable to add note.');}
  }
  async function refresh():Promise<void> {
    const token=++revision;
    try {
      const fetched=await listBookNotes();
      if(disposed||token!==revision)return;
      all=fetched;
      const localActive=loadResearchCollections().find(c=>c.id===activeId);
      if(activeId && !localActive)activeId='';
      if(localActive?.synthesisId) {
        const fresh=all.find(n=>n.id===localActive.synthesisId);
        if(fresh && (!synthesis || !dirty()))synthesis=fresh;
        else if(fresh && synthesis && fresh.revision!==synthesis.revision && dirty())
          synthState.textContent='This synthesis changed in another tab. Export your draft or reload.';
      }
      renderDetail();
    } catch(error){notify(error instanceof Error?error.message:'Unable to load notebook notes.');}
  }

  bind('[data-research-create]','click',()=>{
    if(!guardSwitch())return;
    try {
      const created=createResearchCollection(newName.value,newDescription.value);
      newName.value='';newDescription.value='';
      void activate(created.id,true).then(()=>notify('Collection created locally. Add source notes to begin.'));
    } catch(error){notify(error instanceof Error?error.message:'Unable to create collection.');}
  });
  bind('[data-research-select]','change',()=>{void activate(select.value);});
  bind('[data-research-find]','input',()=>renderSearch());
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
      synthesis=note;
      renderDetail();
      notify('Research synthesis created as a native, revision-controlled Library note.');
    }).catch(error=>notify(error instanceof Error?error.message:'Could not create synthesis.'))
      .finally(()=>{setStatusBusy(false);});
  });
  const synthInput=()=>{
    if(!synthesis)return;
    saveSynth.disabled=!dirty()||busy;
    synthState.textContent=dirty()?'Unsaved synthesis edits':'Saved locally · revision '+synthesis.revision;
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
        synthesis=saved;savedTitle=saved.title;savedBody=saved.bodyMarkdown;
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
      synthesis=fresh;
      savedTitle=fresh.title;savedBody=fresh.bodyMarkdown;
      synthTitle.value=fresh.title;synthBody.value=fresh.bodyMarkdown;
      renderSynthesis();
      notify('Reloaded the last saved synthesis revision.');
    }).catch(error=>notify(error instanceof Error?error.message:'Reload unavailable.'));
  });
  const beforeUnload=(event:BeforeUnloadEvent)=>{
    if(dirty()){event.preventDefault();event.returnValue='';}
  };
  window.addEventListener('beforeunload',beforeUnload);
  const unsubscribe=subscribeBookNotes(()=>{void refresh();});
  void refresh();
  return {
    refresh,addNote,dispose(){
      disposed=true;
      for(const off of events)off();
      unsubscribe();
      window.removeEventListener('beforeunload',beforeUnload);
    },
  };
}
