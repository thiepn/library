import { loadResearchCollections, copyResearchNoteToCollection } from './note-research';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import {
  buildNotebookNavigator, notebookQuickConnections, referenceForNotebookWriting,
} from './note-navigator';
import {
  readNotebookContinuity, saveNotebookContinuity, setFavoriteResearchCollection,
  orderResearchCollections, rememberNotebookNavigation,
} from './note-continuity';

export interface NotebookNavigationHost {
  selected():BookNoteDocumentV1|undefined;
  notes():readonly BookNoteDocumentV1[];
  bookTitle(workId:string):string;
  sourceHref(note:BookNoteDocumentV1):string|undefined;
  openNote(note:BookNoteDocumentV1):Promise<void>;
  openCollection(id:string):Promise<void>;
  activeCollection():string;
  insertReference(markdown:string):void;
  notify(message:string):void;
  noteUrl(note:BookNoteDocumentV1):string;
}
export interface NotebookNavigationController {
  onNoteChanged():void;
  onNotesChanged():void;
  onCollectionChanged():void;
  dispose():void;
}
/**
 * Never owns the notebook editor, note writes, sync or backup.
 * Cross-book navigation delegates through the existing save-before-switch host.
 */
export function mountNotebookNavigation(
  root:HTMLElement,host:NotebookNavigationHost,
):NotebookNavigationController {
  const $=<T extends HTMLElement>(selector:string):T=>{
    const found=root.querySelector<T>(selector);
    if(!found)throw new Error('Missing notebook navigation control: '+selector);
    return found;
  };
  const memberships=$<HTMLElement>('[data-n1n-memberships]');
  const context=$<HTMLElement>('[data-n1n-source-context]');
  const addSelect=$<HTMLSelectElement>('[data-n1n-add-collection]');
  const add=$<HTMLButtonElement>('[data-n1n-add-to-collection]');
  const relatedInput=$<HTMLInputElement>('[data-n1n-related-search]');
  const relatedList=$<HTMLElement>('[data-n1n-related-list]');
  const citationSelect=$<HTMLSelectElement>('[data-n1n-citation-target]');
  const citationInsert=$<HTMLButtonElement>('[data-n1n-insert-reference]');
  const citationCopy=$<HTMLButtonElement>('[data-n1n-copy-reference]');
  const copyNoteLink=$<HTMLButtonElement>('[data-n1n-copy-note-link]');
  const sourceLink=$<HTMLAnchorElement>('[data-n1n-open-source]');
  const status=$<HTMLElement>('[data-n1n-navigation-status]');
  const sort=$<HTMLSelectElement>('[data-n1n-collection-order]');
  const density=$<HTMLSelectElement>('[data-n1n-density]');
  const uncited=$<HTMLInputElement>('[data-n1n-uncited-first]');
  const favorite=$<HTMLButtonElement>('[data-n1n-favorite]');
  const preferenceStatus=$<HTMLElement>('[data-n1n-prefs-status]');
  const detach:Array<()=>void>=[];
  const bind=(selector:string,event:string,callback:EventListener)=>{
    const element=$(selector);element.addEventListener(event,callback);
    detach.push(()=>element.removeEventListener(event,callback));
  };
  const paragraph=(message:string)=>{
    const p=document.createElement('p');p.className='micro';p.textContent=message;return p;
  };
  const button=(label:string,callback:()=>void)=>{
    const el=document.createElement('button');
    el.type='button';el.textContent=label;
    el.addEventListener('click',callback);return el;
  };
  const getNote=(id:string)=>host.notes().find(n=>n.id===id);
  const report=(message:string)=>{status.textContent=message;};
  function preferencesChanged():void {
    const prefs=readNotebookContinuity();
    sort.value=prefs.collectionOrder;
    density.value=prefs.density;
    uncited.checked=prefs.showUncitedFirst;
    root.dataset.n1nDensity=prefs.density;
    const activeId=host.activeCollection();
    favorite.disabled=!activeId;
    favorite.setAttribute('aria-pressed',String(prefs.favoriteCollectionIds.includes(activeId)));
    favorite.textContent=activeId
      ?(prefs.favoriteCollectionIds.includes(activeId)?'Unfavorite collection':'Favorite collection')
      :'Select a collection to favorite';
  }
  function renderMemberships():void {
    memberships.replaceChildren();
    const note=host.selected();
    addSelect.replaceChildren(new Option('Choose another collection…',''));
    if(!note){
      memberships.append(paragraph('Open a saved note to see which collections reuse it.'));
      add.disabled=true;copyNoteLink.disabled=true;
      sourceLink.hidden=true;
      context.textContent='Save a note to access its research collections and source.';
      return;
    }
    copyNoteLink.disabled=false;
    const result=buildNotebookNavigator(note,host.notes(),loadResearchCollections());
    context.textContent=host.bookTitle(note.workId)+' · '+result.sourceLabel;
    const href=host.sourceHref(note);
    sourceLink.hidden=!href;
    if(href)sourceLink.href=href;
    for(const entry of result.memberships){
      const row=document.createElement('div');
      row.className='book-notebook__n1n-membership';
      const name=document.createElement('span');
      name.textContent=entry.name+' · '+(entry.synthesis?'Synthesis':'Collected source');
      row.append(name,button('Open research',()=>{void host.openCollection(entry.id);}));
      memberships.append(row);
    }
    if(!result.memberships.length)
      memberships.append(paragraph('This note is not yet referenced by a research collection.'));
    const available=new Set(result.availableCollections.map(entry=>entry.id));
    for(const collection of orderResearchCollections(loadResearchCollections())
      .filter(collection=>available.has(collection.id))){
      addSelect.add(new Option(collection.name,collection.id));
    }
    add.disabled=!addSelect.value;
  }
  function renderRelated():void {
    relatedList.replaceChildren();
    const note=host.selected();
    if(!note){
      relatedList.append(paragraph('Save or open a note to navigate its connected ideas.'));
      return;
    }
    const result=buildNotebookNavigator(note,host.notes(),loadResearchCollections(),15);
    const query=relatedInput.value.normalize('NFKC').toLocaleLowerCase().trim();
    const prefs=readNotebookContinuity();
    const quick=notebookQuickConnections(result,host.notes(),25);
    const previous=prefs.recentNoteIds.filter(id=>id!==note.id)
      .flatMap(id=>{const other=getNote(id);return other?[{
        note:other,reason:'recent' as const,label:'Previously opened',
      }]:[];});
    const seen=new Set<string>();
    const all=[...previous,...quick].filter(entry=>{
      if(seen.has(entry.note.id))return false;
      seen.add(entry.note.id);
      return !query||[notebookTitle(entry.note),host.bookTitle(entry.note.workId),entry.label]
        .join(' ').normalize('NFKC').toLocaleLowerCase().includes(query);
    }).slice(0,18);
    if(!all.length){relatedList.append(paragraph('No related notes match the current filter.'));return;}
    for(const entry of all){
      const row=document.createElement('div');
      row.className='book-notebook__n1n-related';
      const label=document.createElement('div');
      const strong=document.createElement('strong');
      strong.textContent=notebookTitle(entry.note);
      const small=document.createElement('small');
      small.textContent=host.bookTitle(entry.note.workId)+' · '+entry.label;
      label.append(strong,small);
      row.append(label,button('Open',()=>{void host.openNote(entry.note);}));
      const citation=button('Cite',()=>host.insertReference(referenceForNotebookWriting(entry.note)));
      row.append(citation);relatedList.append(row);
    }
  }
  function renderCitationOptions():void {
    const current=citationSelect.value;
    const note=host.selected();
    citationSelect.replaceChildren(new Option('Choose a saved note…',''));
    citationInsert.disabled=!note;
    citationCopy.disabled=!note;
    if(!note)return;
    const connected=notebookQuickConnections(
      buildNotebookNavigator(note,host.notes(),loadResearchCollections(),24),
      host.notes(),20).map(entry=>entry.note);
    const sorted=[...host.notes()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const candidates=[...connected,...sorted];
    const seen=new Set<string>();
    for(const entry of candidates){
      if(entry.id===note.id||seen.has(entry.id))continue;
      seen.add(entry.id);
      citationSelect.add(new Option(notebookTitle(entry)+' · '+host.bookTitle(entry.workId),entry.id));
      if(seen.size>=120)break;
    }
    citationSelect.value=[...citationSelect.options].some(o=>o.value===current)?current:'';
    citationInsert.disabled=!citationSelect.value;
    citationCopy.disabled=!citationSelect.value;
  }
  function onNoteChanged():void {
    const note=host.selected();
    if(note)rememberNotebookNavigation(note.id);
    renderMemberships();renderRelated();renderCitationOptions();
  }
  function onNotesChanged():void {
    renderMemberships();renderRelated();renderCitationOptions();
  }
  function onCollectionChanged():void {
    preferencesChanged();renderMemberships();renderRelated();renderCitationOptions();
  }
  const updatePrefs=(change:(p:ReturnType<typeof readNotebookContinuity>)=>ReturnType<typeof readNotebookContinuity>)=>{
    try{
      saveNotebookContinuity(change);
      preferencesChanged();
      preferenceStatus.textContent='Display preferences saved on this browser only.';
    }catch(error){
      preferenceStatus.textContent=error instanceof Error?error.message:'Preferences could not be saved.';
    }
  };
  bind('[data-n1n-collection-order]','change',()=>{
    updatePrefs(p=>({...p,collectionOrder:sort.value as typeof p.collectionOrder}));
  });
  bind('[data-n1n-density]','change',()=>{
    updatePrefs(p=>({...p,density:density.value as typeof p.density}));
  });
  bind('[data-n1n-uncited-first]','change',()=>{
    updatePrefs(p=>({...p,showUncitedFirst:uncited.checked}));
  });
  bind('[data-n1n-favorite]','click',()=>{
    const id=host.activeCollection();
    if(!id)return;
    try{
      const was=readNotebookContinuity().favoriteCollectionIds.includes(id);
      setFavoriteResearchCollection(id,!was);
      preferencesChanged();
      preferenceStatus.textContent=was?'Collection removed from favorites.':'Collection added to favorites.';
    }catch(error){preferenceStatus.textContent=error instanceof Error?error.message:'Could not favorite collection.';}
  });
  bind('[data-n1n-add-collection]','change',()=>{add.disabled=!addSelect.value||!host.selected();});
  bind('[data-n1n-add-to-collection]','click',()=>{
    const note=host.selected(),id=addSelect.value;
    if(!note||!id){report('Select a saved note and a destination collection.');return;}
    try{
      copyResearchNoteToCollection(note.id,id);
      report('Added the stable note reference. The original note remains unchanged.');
      renderMemberships();
      void host.openCollection(id);
    }catch(error){report(error instanceof Error?error.message:'Cannot collect this note.');}
  });
  bind('[data-n1n-related-search]','input',()=>renderRelated());
  bind('[data-n1n-citation-target]','change',()=>{
    citationInsert.disabled=!citationSelect.value||!host.selected();
    citationCopy.disabled=citationInsert.disabled;
  });
  bind('[data-n1n-insert-reference]','click',()=>{
    const note=getNote(citationSelect.value);
    if(!note){report('Choose an available saved note.');return;}
    host.insertReference(referenceForNotebookWriting(note));
    report('Note reference inserted at cursor; save the draft to persist it.');
  });
  bind('[data-n1n-copy-reference]','click',()=>{
    const note=getNote(citationSelect.value);
    if(!note)return;
    void navigator.clipboard.writeText(referenceForNotebookWriting(note))
      .then(()=>report('Stable note reference copied.'),
        ()=>report('Clipboard unavailable. Use Insert citation instead.'));
  });
  bind('[data-n1n-copy-note-link]','click',()=>{
    const note=host.selected();if(!note)return;
    void navigator.clipboard.writeText(host.noteUrl(note))
      .then(()=>report('Direct note URL copied.'),
        ()=>report('Clipboard unavailable. The note URL is in your browser address bar.'));
  });
  const external=()=>onCollectionChanged();
  window.addEventListener('library-notebook-preferences-changed',external);
  const localChanges=()=>onCollectionChanged();
  window.addEventListener('storage',localChanges);
  preferencesChanged();
  renderMemberships();renderRelated();renderCitationOptions();
  return {
    onNoteChanged,onNotesChanged,onCollectionChanged,
    dispose(){
      window.removeEventListener('library-notebook-preferences-changed',external);
      window.removeEventListener('storage',localChanges);
      for(const off of detach)off();
    },
  };
}
