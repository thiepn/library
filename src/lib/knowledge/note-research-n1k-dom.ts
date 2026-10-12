import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { notebookWordCount } from './note-links';
import { renderNotebookPreview } from './note-preview';
import {
  exportResearchPackage, parseResearchPackage, reconcileResearchPackage,
  type ResearchPackageV1,
} from './note-research-package';
import {
  importResearchCollectionIndex, NOTEBOOK_COLLECTIONS_FORMAT,
  describeResearchSource, type ResearchCollection, type ResearchSource,
} from './note-research';
import {
  researchReferences, researchBibliographyMarkdown, researchCitationMarkdown,
  formatResearchCitation,
} from './note-references';
import {
  readResearchDraftCheckpoint, saveResearchDraftCheckpoint,
  clearResearchDraftCheckpoint, researchRecoveryMarkdown,
} from './note-research-drafts';

export interface ResearchRefinementHost {
  active():ResearchCollection|undefined;
  notes():readonly BookNoteDocumentV1[];
  synthesis():BookNoteDocumentV1|undefined;
  title():string;
  body():string;
  setDraft(title:string,body:string):void;
  sourceHref(note:BookNoteDocumentV1):string|undefined;
  bookTitle(workId:string):string;
  openNote(note:BookNoteDocumentV1):Promise<void>;
  pins():{left:string;right:string};
  setPins(left:string,right:string):void;
  activateCollection(id:string):Promise<void>;
  notify(message:string):void;
}
export interface ResearchRefinements {
  onCollectionChanged():void;
  onNotesChanged():void;
  onSynthesisChanged():void;
  onSynthesisSaved():void;
  onDraftEdited():void;
  dispose():void;
}

export function mountResearchRefinements(
  root:HTMLElement, host:ResearchRefinementHost,
):ResearchRefinements {
  const $=<T extends HTMLElement>(selector:string):T=>{
    const node=root.querySelector<T>(selector);
    if(!node)throw new Error('Missing research refinement element: '+selector);
    return node;
  };
  const pkgFile=$<HTMLInputElement>('[data-research-package-file]');
  const pkgReview=$<HTMLElement>('[data-research-package-review]');
  const pkgStatus=$<HTMLElement>('[data-research-package-status]');
  const pkgDetails=$<HTMLElement>('[data-research-package-details]');
  const attach=$<HTMLButtonElement>('[data-research-attach-package]');
  const navStatus=$<HTMLElement>('[data-research-source-position]');
  const bibliography=$<HTMLElement>('[data-research-bibliography]');
  const checkpointStatus=$<HTMLElement>('[data-research-checkpoint-status]');
  const restore=$<HTMLButtonElement>('[data-research-restore-checkpoint]');
  const discard=$<HTMLButtonElement>('[data-research-discard-checkpoint]');
  const exportCheckpoint=$<HTMLButtonElement>('[data-research-export-checkpoint]');
  const downloadDraft=$<HTMLButtonElement>('[data-research-download-draft]');
  const copyDraft=$<HTMLButtonElement>('[data-research-copy-draft]');
  const insertCitation=$<HTMLButtonElement>('[data-research-insert-source]');
  const insertQuestions=$<HTMLButtonElement>('[data-research-insert-questions]');
  const insertComparison=$<HTMLButtonElement>('[data-research-insert-comparison]');
  const previewToggle=$<HTMLButtonElement>('[data-research-toggle-preview]');
  const livePreview=$<HTMLElement>('[data-research-live-preview]');
  const writingStats=$<HTMLElement>('[data-research-writing-stats]');
  const synthBody=$<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const synthTitle=$<HTMLInputElement>('[data-research-synthesis-title]');
  const listeners:Array<()=>void>=[];
  let pending:ResearchPackageV1|undefined;
  let pageBusy=false;
  let previewTimer:ReturnType<typeof setTimeout>|undefined;
  const bind=(query:string,kind:string,callback:EventListener)=>{
    const node=$(query);node.addEventListener(kind,callback);
    listeners.push(()=>node.removeEventListener(kind,callback));
  };
  const info=(tag:string,value:string):HTMLElement=>{
    const element=document.createElement(tag);
    element.textContent=value;
    return element;
  };
  const safeFile=(text:string):string=>text.normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'collection';
  const download=(name:string,content:string,type:string)=>{
    const url=URL.createObjectURL(new Blob([content],{type}));
    const link=document.createElement('a');
    link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
  function orderedSources():ResearchSource[] {
    const active=host.active();
    if(!active)return [];
    const byId=new Map(host.notes().map(note=>[note.id,note]));
    return active.noteIds.flatMap(id=>{
      const note=byId.get(id);
      return note?[{
        note,bookTitle:host.bookTitle(note.workId),
        sourceLocation:describeResearchSource(note.anchor,note.chapterKey),
        sourceHref:host.sourceHref(note),
      }]:[];
    });
  }
  function renderNavigation():void {
    const sources=orderedSources();
    const {left}=host.pins();
    const index=sources.findIndex(item=>item.note.id===left);
    navStatus.textContent=index<0?'No source selected':
      (index+1)+' / '+sources.length+' · '+host.bookTitle(sources[index].note.workId);
    $<HTMLButtonElement>('[data-research-previous-source]').disabled=index<=0;
    $<HTMLButtonElement>('[data-research-next-source]').disabled=index<0||index>=sources.length-1;
    $<HTMLButtonElement>('[data-research-swap]').disabled=sources.length<2;
    insertCitation.disabled=!host.synthesis()||!sources.length;
    insertQuestions.disabled=!host.synthesis();
    const currentPins=host.pins();
    insertComparison.disabled=!host.synthesis()||!currentPins.left||!currentPins.right
      ||currentPins.left===currentPins.right;
    downloadDraft.disabled=!host.synthesis();
    copyDraft.disabled=!host.synthesis();
  }
  function step(direction:-1|1):void {
    const sources=orderedSources();
    const {left}=host.pins();
    const current=sources.findIndex(item=>item.note.id===left);
    const next=current+direction;
    if(next<0||next>=sources.length)return;
    const id=sources[next].note.id;
    const second=sources[next+1]?.note.id??sources[next-1]?.note.id??'';
    host.setPins(id,second);
    renderNavigation();
  }
  function renderBibliography():void {
    bibliography.replaceChildren();
    const refs=researchReferences(orderedSources());
    if(!refs.length){
      bibliography.append(info('p','Add source notes to assemble a bibliography.'));
      return;
    }
    for(const ref of refs) {
      const row=info('div','');
      row.className='book-notebook__reference-row';
      const details=info('div','');
      details.append(info('strong','['+ref.label+'] '+ref.bookTitle),
        info('p',ref.noteTitle+' — '+ref.location));
      const actions=info('div','');
      actions.className='book-notebook__research-source-actions';
      const copy=info('button','Copy citation') as HTMLButtonElement;
      copy.type='button';
      copy.addEventListener('click',()=>{
        void navigator.clipboard.writeText(formatResearchCitation(ref))
          .then(()=>host.notify('Source citation copied.'),
            ()=>host.notify('Clipboard unavailable; select the citation text.'));
      });
      const insert=info('button','Insert in synthesis') as HTMLButtonElement;
      insert.type='button';
      insert.disabled=!host.synthesis();
      insert.addEventListener('click',()=>insertAtCursor(researchCitationMarkdown(ref)));
      actions.append(copy,insert);
      if(ref.readerHref){
        const link=document.createElement('a');
        link.href=ref.readerHref;link.textContent='Open original';
        link.title='Open the source reader; recorded location appears in the citation.';
        actions.append(link);
      }
      row.append(details,actions);bibliography.append(row);
    }
  }
  function insertAtCursor(text:string):void {
    if(!host.synthesis()){host.notify('Create a synthesis note before inserting references.');return;}
    const start=synthBody.selectionStart,end=synthBody.selectionEnd;
    const before=synthBody.value.slice(0,start),after=synthBody.value.slice(end);
    const prefix=before && !before.endsWith('\n')?'\n':'';
    const suffix=after && !after.startsWith('\n')?'\n':'';
    const addition=prefix+text+suffix;
    if(before.length+addition.length+after.length>synthBody.maxLength){
      host.notify('The synthesis has reached its maximum size.');return;
    }
    const next=before+addition+after;
    host.setDraft(synthTitle.value,next);
    synthBody.focus();
    synthBody.setSelectionRange(before.length+addition.length,before.length+addition.length);
    onDraftEdited();
  }
  function refreshWritingStats():void {
    const active=!!host.synthesis();
    previewToggle.disabled=!active;
    writingStats.textContent=active
      ? notebookWordCount(host.body()).toLocaleString()+' words · '
        +host.body().length.toLocaleString()+' characters'
      : 'No synthesis to preview';
  }
  function refreshLivePreview():void {
    refreshWritingStats();
    if(livePreview.hidden)return;
    const text=host.body();
    livePreview.replaceChildren();
    if(!host.synthesis()) {
      livePreview.append(info('p','Create a synthesis note to see its Markdown preview.'));
      return;
    }
    renderNotebookPreview(livePreview,text,{
      notes:host.notes(),
      onOpenNote:note=>{void host.openNote(note);},
    });
  }
  function schedulePreview():void {
    refreshWritingStats();
    if(previewTimer)clearTimeout(previewTimer);
    if(!livePreview.hidden)
      previewTimer=setTimeout(()=>{previewTimer=undefined;refreshLivePreview();},180);
  }

  function recovery(){
    const active=host.active(),note=host.synthesis();
    return active&&note?readResearchDraftCheckpoint(active.id,note.id):undefined;
  }
  function renderRecovery():void {
    const checkpoint=recovery(),note=host.synthesis();
    restore.disabled=!checkpoint||!note;
    discard.disabled=!checkpoint;
    exportCheckpoint.disabled=!checkpoint;
    if(!checkpoint||!note){
      checkpointStatus.textContent='No recovery draft in this tab';return;
    }
    const stale=checkpoint.baseRevision!==note.revision;
    checkpointStatus.textContent='Draft from '+new Date(checkpoint.savedAt).toLocaleString()
      +(stale?' · saved note revision changed':' · revision '+checkpoint.baseRevision);
  }
  function onDraftEdited():void {
    const collection=host.active(),note=host.synthesis();
    if(!collection||!note)return;
    if(host.title()===note.title && host.body()===note.bodyMarkdown){
      clearResearchDraftCheckpoint(collection.id,note.id);
    }else if(!saveResearchDraftCheckpoint(collection.id,note.id,note.revision,host.title(),host.body())){
      host.notify('Session checkpoint could not be saved. Download a draft copy for recovery.');
    }
    renderRecovery();
    schedulePreview();
  }
  function onSynthesisSaved():void {
    const collection=host.active(),note=host.synthesis();
    if(collection&&note)clearResearchDraftCheckpoint(collection.id,note.id);
    renderRecovery();renderBibliography();renderNavigation();
    schedulePreview();
  }
  function onSynthesisChanged():void {
    renderRecovery();renderBibliography();renderNavigation();
    schedulePreview();
  }
  function onCollectionChanged():void {
    pending=undefined;
    pkgReview.hidden=true;
    renderNavigation();renderBibliography();renderRecovery();
    schedulePreview();
  }
  function onNotesChanged():void {
    renderNavigation();renderBibliography();
  }

  bind('[data-research-previous-source]','click',()=>step(-1));
  bind('[data-research-next-source]','click',()=>step(1));
  bind('[data-research-swap]','click',()=>{
    const p=host.pins();
    host.setPins(p.right,p.left);
    renderNavigation();
  });
  bind('[data-research-export-bibliography]','click',()=>{
    const active=host.active();
    if(!active){host.notify('Select a collection first.');return;}
    download('bibliography-'+safeFile(active.name)+'.md',
      researchBibliographyMarkdown(researchReferences(orderedSources())),
      'text/markdown;charset=utf-8');
    host.notify('Source-qualified bibliography export requested.');
  });
  bind('[data-research-insert-source]','click',()=>{
    const pinned=host.pins().left;
    const ref=researchReferences(orderedSources()).find(item=>item.id===pinned);
    if(ref)insertAtCursor(researchCitationMarkdown(ref));
    else host.notify('Pin a source before inserting its reference.');
  });
  bind('[data-research-insert-questions]','click',()=>{
    insertAtCursor('## Source evaluation\n\n- What is the author’s main claim?\n- What evidence supports it?\n- How does this compare with other sources?\n- What remains uncertain?\n');
  });
  bind('[data-research-insert-comparison]','click',()=>{
    const {left,right}=host.pins();
    const refs=researchReferences(orderedSources());
    const a=refs.find(item=>item.id===left),b=refs.find(item=>item.id===right);
    if(!a||!b||a.id===b.id){
      host.notify('Pin two different sources to build a comparison.');return;
    }
    insertAtCursor([
      '## Comparing two sources','',
      '### Source A','',researchCitationMarkdown(a),'',
      '### Source B','',researchCitationMarkdown(b),'',
      '### Shared question','','',
      '### Points of agreement','','',
      '### Differences in arguments or evidence','','',
      '### My synthesis','','',
    ].join('\n'));
  });
  bind('[data-research-toggle-preview]','click',()=>{
    livePreview.hidden=!livePreview.hidden;
    previewToggle.setAttribute('aria-expanded',String(!livePreview.hidden));
    previewToggle.textContent=livePreview.hidden?'Show writing preview':'Hide writing preview';
    if(!livePreview.hidden)refreshLivePreview();
  });
  bind('[data-research-download-draft]','click',()=>{
    const active=host.active(),note=host.synthesis();
    if(!active||!note)return;
    const markdown=[
      '# '+host.title().replace(/[\r\n]/g,' ').replace(/^#+\s*/,''),
      '',
      '> Manual research synthesis draft; not necessarily saved to Library.',
      '> Collection ID: '+active.id,
      '> Note ID: '+note.id+' · base revision '+note.revision,
      '',host.body(), '',
    ].join('\n');
    download('synthesis-draft-'+safeFile(active.name)+'.md',markdown,'text/markdown;charset=utf-8');
    host.notify('Current editor draft download requested. This is not a confirmed save.');
  });
  bind('[data-research-copy-draft]','click',()=>{
    void navigator.clipboard.writeText('# '+host.title()+'\n\n'+host.body()+'\n')
      .then(()=>host.notify('Current synthesis Markdown copied.'),
        ()=>host.notify('Clipboard unavailable; copy the editor text manually.'));
  });
  bind('[data-research-restore-checkpoint]','click',()=>{
    const checkpoint=recovery(),note=host.synthesis();
    if(!checkpoint||!note)return;
    const changed=checkpoint.baseRevision!==note.revision;
    if(!window.confirm(changed
      ? 'The saved synthesis changed since this checkpoint. Restore text into the editor without saving or overriding its latest revision?'
      : 'Restore the temporary synthesis draft into the editor? Nothing is saved automatically.'))return;
    host.setDraft(checkpoint.title,checkpoint.bodyMarkdown);
    host.notify('Draft restored to the editor. Review it and choose Save synthesis to commit.');
    renderRecovery();
  });
  bind('[data-research-discard-checkpoint]','click',()=>{
    const active=host.active(),note=host.synthesis();
    if(!active||!note)return;
    if(!window.confirm('Discard this tab-only synthesis checkpoint? The saved notebook note will remain unchanged.'))return;
    clearResearchDraftCheckpoint(active.id,note.id);
    renderRecovery();host.notify('Temporary checkpoint discarded.');
  });
  bind('[data-research-export-checkpoint]','click',()=>{
    const active=host.active(),checkpoint=recovery();
    if(!active||!checkpoint)return;
    download('synthesis-recovery-'+safeFile(active.name)+'.md',
      researchRecoveryMarkdown(checkpoint),'text/markdown;charset=utf-8');
    host.notify('Recovery copy download requested; no notebook revisions were changed.');
  });
  bind('[data-research-export-package]','click',()=>{
    const active=host.active();
    if(!active)return;
    pageBusy=true;
    void exportResearchPackage(active,host.notes()).then(text=>{
      download('research-package-'+safeFile(active.name)+'.json',text,'application/json;charset=utf-8');
      host.notify('Complete research package download requested. Contains readable note content and source custody hashes; store privately.');
    }).catch(error=>{
      host.notify(error instanceof Error?error.message:'Could not export package.');
    }).finally(()=>{pageBusy=false;});
  });
  bind('[data-research-import-package]','click',()=>pkgFile.click());
  bind('[data-research-package-file]','change',()=>{
    const file=pkgFile.files?.[0];
    pkgFile.value='';
    if(!file)return;
    pending=undefined;attach.disabled=true;pkgReview.hidden=false;
    pkgDetails.replaceChildren();
    if(file.size>10_000_000){pkgStatus.textContent='File exceeds 10 MB. Choose a smaller package.';return;}
    pkgStatus.textContent='Reading local package and checking source custody hashes…';
    void file.text().then(parseResearchPackage)
      .then(async data=>{
        const review=await reconcileResearchPackage(data,host.notes());
        pending=data;
        const description=info('p',data.collection.name+' · '
          +data.collection.noteIds.length+' collection notes · '
          +(data.collection.synthesisId?'synthesis included':'no synthesis'));
        const status=info('p',review.matching.length+' exact matches, '
          +review.missing.length+' missing notes, '+review.changed.length+' changed notes.');
        const note=info('p',review.attachable
          ? 'Every note exactly matches local custody. You may attach only the collection metadata.'
          : 'No note content will be imported. Restore missing notes via the existing V2 backup, or reconcile changed notes separately.');
        pkgDetails.replaceChildren(description,status,note);
        for(const id of [...review.missing,...review.changed].slice(0,25))
          pkgDetails.append(info('p','Note ID: '+id));
        attach.disabled=!review.attachable;
        pkgStatus.textContent=review.attachable
          ? 'Complete exact local match; collection attachment available.'
          : 'Local records do not match package custody; attachment blocked.';
      }).catch(error=>{
        pending=undefined;attach.disabled=true;
        pkgStatus.textContent=error instanceof Error?error.message:'Invalid research package.';
      });
  });
  bind('[data-research-attach-package]','click',()=>{
    if(!pending || pageBusy)return;
    const selected=pending;
    pageBusy=true;attach.disabled=true;
    void reconcileResearchPackage(selected,host.notes()).then(async review=>{
      if(!review.attachable)throw new Error('Local note custody changed since the import review. Attachment blocked.');
      if(!window.confirm('Attach collection "'+selected.collection.name
        +'" to this browser? This changes collection references only, never existing notes.'))return;
      const raw=JSON.stringify({
        format:NOTEBOOK_COLLECTIONS_FORMAT,
        schemaVersion:1,collections:[selected.collection],
      });
      importResearchCollectionIndex(raw);
      pending=undefined;pkgReview.hidden=true;
      await host.activateCollection(selected.collection.id);
      host.notify('Collection references attached. Native notes were not altered.');
    }).catch(error=>{
      pkgStatus.textContent=error instanceof Error?error.message:'Could not attach collection.';
    }).finally(()=>{pageBusy=false;attach.disabled=!pending;});
  });
  bind('[data-research-dismiss-package]','click',()=>{
    pkgReview.hidden=true;pending=undefined;attach.disabled=true;
    pkgDetails.replaceChildren();
  });

  onCollectionChanged();
  return {
    onCollectionChanged,onNotesChanged,onSynthesisChanged,onSynthesisSaved,onDraftEdited,
    dispose:()=>{if(previewTimer)clearTimeout(previewTimer);for(const off of listeners)off();},
  };
}
