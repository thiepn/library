import { listBookNotes } from './note-store';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { extractNotebookTopics } from './note-workspace';
import { describeResearchSource, loadResearchCollections,
  renameResearchCollection, duplicateResearchCollection,
  copyResearchNoteToCollection, type ResearchCollection, type ResearchSource,
} from './note-research';
import { consolidateResearch, makeResearchReviewPrompts,
  researchKnowledgeMarkdown, researchNotebookCatalogueMarkdown,
  type KnowledgeConsolidation, type SourceCoverage,
} from './note-consolidation';
import { researchCitationMarkdown, researchReferences } from './note-references';

export interface KnowledgeWorkbenchHost {
  active():ResearchCollection|undefined;
  notes():readonly BookNoteDocumentV1[];
  synthesis():BookNoteDocumentV1|undefined;
  draft():{title:string;body:string};
  isDirty():boolean;
  setDraft(title:string,body:string):void;
  bookTitle(workId:string):string;
  sourceHref(note:BookNoteDocumentV1):string|undefined;
  openNote(note:BookNoteDocumentV1):Promise<void>;
  chooseCollection(id:string):Promise<void>;
  pinSource(id:string):void;
  notify(message:string):void;
}
export interface KnowledgeWorkbench {
  onCollectionChanged():void;
  onNotesChanged():void;
  onDraftChanged():void;
  dispose():void;
}
const maxPreview=24;
const safeFilename=(name:string)=>name.normalize('NFKD')
  .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'knowledge';

export function mountKnowledgeWorkbench(
  root:HTMLElement,host:KnowledgeWorkbenchHost,
):KnowledgeWorkbench {
  const $=<T extends HTMLElement>(selector:string):T=>{
    const node=root.querySelector<T>(selector);
    if(!node)throw new Error('Missing N1M knowledge workspace control: '+selector);
    return node;
  };
  const librarySearch=$<HTMLInputElement>('[data-n1m-collection-filter]');
  const libraryResults=$<HTMLElement>('[data-n1m-collection-results]');
  const name=$<HTMLInputElement>('[data-n1m-name]');
  const description=$<HTMLTextAreaElement>('[data-n1m-description]');
  const organizationStatus=$<HTMLElement>('[data-n1m-organization-status]');
  const copyNote=$<HTMLSelectElement>('[data-n1m-copy-note]');
  const copyDestination=$<HTMLSelectElement>('[data-n1m-copy-destination]');
  const stats=$<HTMLElement>('[data-n1m-stats]');
  const topics=$<HTMLElement>('[data-n1m-topics]');
  const coverage=$<HTMLElement>('[data-n1m-coverage]');
  const sections=$<HTMLElement>('[data-n1m-sections]');
  const prompts=$<HTMLElement>('[data-n1m-prompts]');
  const related=$<HTMLElement>('[data-n1m-related-collections]');
  const synthBody=$<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const listeners:Array<()=>void>=[];
  let scheduled:ReturnType<typeof setTimeout>|undefined;
  const bind=(selector:string,event:string,listener:EventListener)=>{
    const node=$(selector);
    node.addEventListener(event,listener);
    listeners.push(()=>node.removeEventListener(event,listener));
  };
  const el=(tag:string,content?:string):HTMLElement=>{
    const node=document.createElement(tag);
    if(content!==undefined)node.textContent=content;
    return node;
  };
  const action=(text:string,fn:()=>void):HTMLButtonElement=>{
    const node=document.createElement('button');
    node.type='button';node.textContent=text;
    node.addEventListener('click',fn);
    return node;
  };
  const download=(file:string,content:string)=>{
    const url=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=file;
    document.body.append(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
  const sourcesFor=(c:ResearchCollection,available:readonly BookNoteDocumentV1[]):ResearchSource[]=>{
    const byId=new Map(available.map(note=>[note.id,note]));
    return c.noteIds.flatMap(id=>{
      const note=byId.get(id);
      return note?[{note,bookTitle:host.bookTitle(note.workId),
        sourceLocation:describeResearchSource(note.anchor,note.chapterKey),
        sourceHref:host.sourceHref(note)}]:[];
    });
  };
  const overview=(body?:string,notes=host.notes())=>{
    const collection=host.active();
    if(!collection)return undefined;
    return consolidateResearch(collection,notes,body??host.draft().body,
      loadResearchCollections(),id=>host.bookTitle(id));
  };
  function openInEditor(note:BookNoteDocumentV1):void {
    void host.openNote(note);
  }
  function scrollToSource(source:SourceCoverage):void {
    host.pinSource(source.id);
    const panel=$<HTMLElement>('[data-research-compare]');
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function jumpToPosition(offset:number):void {
    if(!host.synthesis())return;
    synthBody.focus();
    synthBody.setSelectionRange(offset,offset);
    const prior=synthBody.value.slice(0,offset);
    const line=prior.split('\n').length;
    const lh=parseFloat(getComputedStyle(synthBody).lineHeight)||25;
    synthBody.scrollTop=Math.max(0,line-4)*lh;
    synthBody.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function insertAtCursor(markdown:string):void {
    if(!host.synthesis()){
      host.notify('Create a native synthesis note before inserting review content.');
      return;
    }
    const old=host.draft().body;
    const a=synthBody.selectionStart,b=synthBody.selectionEnd;
    const prefix=a>0&&!old.slice(0,a).endsWith('\n')?'\n':'';
    const suffix=b<old.length&&!old.slice(b).startsWith('\n')?'\n':'';
    const insertion=prefix+markdown.trimEnd()+'\n'+suffix;
    const replacement=old.slice(0,a)+insertion+old.slice(b);
    if(replacement.length>250000){
      host.notify('The synthesis note has reached its text limit.');return;
    }
    host.setDraft(host.draft().title,replacement);
    synthBody.focus();
    synthBody.setSelectionRange(a+insertion.length,a+insertion.length);
  }
  function renderCollections():void {
    const query=librarySearch.value.normalize('NFKC').trim().toLocaleLowerCase();
    const words=query.split(/\s+/).filter(Boolean);
    const byId=new Map(host.notes().map(note=>[note.id,note]));
    const all=loadResearchCollections();
    const matches=all.filter(c=>{
      const notes=c.noteIds.map(id=>byId.get(id)).filter((doc):doc is BookNoteDocumentV1=>!!doc);
      const haystack=[c.name,c.description,...notes.flatMap(note=>[
        notebookTitle(note),host.bookTitle(note.workId),
        ...extractNotebookTopics(note.bodyMarkdown),
      ])].join(' ').normalize('NFKC').toLocaleLowerCase();
      return words.every(word=>haystack.includes(word));
    }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,30);
    libraryResults.replaceChildren();
    if(!matches.length){
      libraryResults.append(el('p',all.length?'No collections match this search.':
        'Create a collection to organize research across your books.'));
      return;
    }
    for(const c of matches){
      const card=el('div');card.className='book-notebook__n1m-workspace';
      if(host.active()?.id===c.id)card.dataset.active='true';
      const label=el('div');label.className='book-notebook__n1m-workspace-text';
      label.append(el('strong',c.name),el('span',c.description||
        'No research purpose recorded'));
      const noteNames=c.noteIds.map(id=>byId.get(id)).filter((n):n is BookNoteDocumentV1=>!!n);
      const books=new Set(noteNames.map(note=>note.workId)).size;
      label.append(el('small',c.noteIds.length+' source notes · '+books+
        ' books · '+(c.synthesisId?'synthesis linked':'no synthesis')));
      const button=action(host.active()?.id===c.id?'Current':'Open workspace',()=>{
        void host.chooseCollection(c.id);
      });
      if(host.active()?.id===c.id)button.disabled=true;
      card.append(label,button);libraryResults.append(card);
    }
  }
  function updateOrganization():void {
    const collection=host.active();
    if(!collection)return;
    name.value=collection.name;
    description.value=collection.description;
    organizationStatus.textContent='Source references and existing notes are unchanged.';
    updateCopyOptions();
  }
  function updateCopyOptions():void {
    const c=host.active();
    const keepNote=copyNote.value,keepDestination=copyDestination.value;
    copyNote.replaceChildren(new Option('Choose a collected source…',''));
    copyDestination.replaceChildren(new Option('Choose a destination…',''));
    if(!c)return;
    const byId=new Map(host.notes().map(note=>[note.id,note]));
    for(const id of c.noteIds){
      const note=byId.get(id);
      if(note)copyNote.add(new Option(host.bookTitle(note.workId)+' — '+notebookTitle(note),id));
    }
    for(const other of loadResearchCollections().filter(item=>item.id!==c.id))
      copyDestination.add(new Option(other.name,other.id));
    if([...copyNote.options].some(option=>option.value===keepNote))copyNote.value=keepNote;
    if([...copyDestination.options].some(option=>option.value===keepDestination))
      copyDestination.value=keepDestination;
  }
  function renderStats(result:KnowledgeConsolidation):void {
    stats.replaceChildren();
    const items=[
      [result.sources.length,'Collected notes'],
      [result.citedCount,'Linked in synthesis'],
      [result.uncitedCount,'Not yet linked'],
      [result.missingCount,'Unavailable'],
      [result.topics.length,'Explicit topics'],
    ] as const;
    for(const [value,label] of items){
      const tile=el('div');
      tile.append(el('strong',String(value)),el('span',label));
      stats.append(tile);
    }
  }
  function renderTopics(result:KnowledgeConsolidation):void {
    topics.replaceChildren();
    if(!result.topics.length){
      topics.append(el('p','Add #topic/name markers in source notes to organize research themes.'));
      return;
    }
    for(const topic of result.topics.slice(0,maxPreview)){
      const item=el('div');item.className='book-notebook__n1m-topic';
      item.append(el('strong','#'+topic.id),
        el('small',topic.sources.length+' notes · '+topic.books+' books'));
      const show=action('Filter sources',()=>{
        const filter=$<HTMLInputElement>('[data-research-filter-sources]');
        filter.value=topic.id;filter.dispatchEvent(new Event('input',{bubbles:true}));
        filter.scrollIntoView({behavior:'smooth',block:'center'});
      });
      item.append(show);topics.append(item);
    }
  }
  function renderCoverage(result:KnowledgeConsolidation):void {
    coverage.replaceChildren();
    if(!result.sources.length){
      coverage.append(el('p','Collect source notes to build your evidence map.'));return;
    }
    for(const source of result.sources.slice(0,120)){
      const row=el('div');row.className='book-notebook__n1m-source';
      const info=el('div');
      info.append(el('strong',source.title),
        el('span',source.book+' · '+source.location),
        el('small',!source.note?'Missing local note':
          source.cited?'Linked '+source.citationCount+' time(s) in current synthesis':
            'Not linked in current synthesis'));
      const actions=el('div');
      if(source.note){
        actions.append(
          action('Read',()=>openInEditor(source.note!)),
          action('Pin',()=>scrollToSource(source)),
        );
      }
      const ref=host.draft().body.indexOf('[[note:'+source.id);
      const jump=action('Find in synthesis',()=>jumpToPosition(ref));
      jump.disabled=ref<0||!host.synthesis();
      actions.append(jump);
      if(source.note&&host.synthesis()){
        actions.append(action('Cite',()=>{
          const note=source.note!;
          const references=researchReferences(sourcesFor(host.active()!,host.notes()));
          const entry=references.find(row=>row.id===note.id);
          if(entry)insertAtCursor(researchCitationMarkdown(entry));
        }));
      }
      row.append(info,actions);coverage.append(row);
    }
  }
  function renderSections(result:KnowledgeConsolidation):void {
    sections.replaceChildren();
    if(!result.sections.length){
      sections.append(el('p','Add Markdown headings in the synthesis to create navigable sections.'));
      return;
    }
    for(const section of result.sections.slice(0,60)){
      const item=action(section.title+' · '+section.citations.length+' source link(s)',
        ()=>jumpToPosition(section.offset));
      item.style.paddingInlineStart=(11+(section.level-1)*9)+'px';
      item.disabled=!host.synthesis();
      sections.append(item);
    }
  }
  function renderPrompts(result:KnowledgeConsolidation):void {
    prompts.replaceChildren();
    for(const prompt of makeResearchReviewPrompts(result,10)){
      const article=el('article');article.className='book-notebook__n1m-prompt';
      article.append(el('strong',prompt.label),el('p',prompt.question));
      const buttons=el('div');
      buttons.append(action('Copy question',()=>{
        void navigator.clipboard.writeText(prompt.question)
          .then(()=>host.notify('Research question copied.'),
            ()=>host.notify('Clipboard unavailable; select the question text.'));
      }));
      const insert=action('Insert into synthesis',()=>{
        const refs=prompt.sourceIds.map(id=>'[[note:'+id+']]').join(' · ');
        insertAtCursor('### '+prompt.label+'\n\n'+prompt.question
          +(refs?'\n\nSources: '+refs:'')+'\n\n');
      });
      insert.disabled=!host.synthesis();
      buttons.append(insert);
      article.append(buttons);prompts.append(article);
    }
  }
  function renderRelatedCollections(result:KnowledgeConsolidation):void {
    related.replaceChildren();
    if(!result.otherCollections.length){
      related.append(el('p','No other collections currently reuse these source notes.'));
      return;
    }
    for(const item of result.otherCollections.slice(0,10)){
      const row=el('div');
      row.className='book-notebook__n1m-related-row';
      row.append(el('span',item.name+' · '+item.shared+' shared source(s)'),
        action('Open collection',()=>{void host.chooseCollection(item.id);}));
      related.append(row);
    }
  }
  function renderOverview():void {
    const result=overview();
    for(const element of [stats,topics,coverage,sections,prompts,related])element.replaceChildren();
    if(!result)return;
    renderStats(result);renderTopics(result);renderCoverage(result);
    renderSections(result);renderPrompts(result);
    renderRelatedCollections(result);
  }
  function onCollectionChanged():void {
    updateOrganization();renderCollections();renderOverview();
  }
  function onNotesChanged():void {
    renderCollections();updateCopyOptions();renderOverview();
  }
  function onDraftChanged():void {
    if(scheduled)clearTimeout(scheduled);
    scheduled=setTimeout(()=>{scheduled=undefined;renderOverview();},220);
  }

  bind('[data-n1m-collection-filter]','input',()=>renderCollections());
  bind('[data-n1m-save-organization]','click',()=>{
    const active=host.active();if(!active)return;
    if(host.isDirty()){
      organizationStatus.textContent='Save or export your open synthesis draft before changing collection details.';
      return;
    }
    try{
      renameResearchCollection(active.id,name.value,description.value);
      organizationStatus.textContent='Collection details saved locally. Native notes were not changed.';
      host.notify('Collection details updated locally.');
      renderCollections();
      void host.chooseCollection(active.id);
    }catch(error){organizationStatus.textContent=error instanceof Error?error.message:'Unable to save collection details.';}
  });
  bind('[data-n1m-duplicate]','click',()=>{
    const active=host.active();if(!active)return;
    if(host.isDirty()){
      organizationStatus.textContent='Save the current synthesis before switching to a duplicated collection.';
      return;
    }
    if(!window.confirm('Duplicate collection references? The new collection will not own the original synthesis.'))return;
    try{
      const created=duplicateResearchCollection(active.id);
      host.notify('Collection references duplicated. Original source notes remain unchanged.');
      void host.chooseCollection(created.id);
    }catch(error){organizationStatus.textContent=error instanceof Error?error.message:'Unable to duplicate collection.';}
  });
  bind('[data-n1m-copy-reference]','click',()=>{
    const noteId=copyNote.value,destination=copyDestination.value;
    if(!noteId||!destination){
      organizationStatus.textContent='Choose a collected source and a different destination collection.';
      return;
    }
    try{
      copyResearchNoteToCollection(noteId,destination);
      organizationStatus.textContent='Source reference copied. Source note and collection synthesis were not modified.';
      renderCollections();
    }catch(error){organizationStatus.textContent=error instanceof Error?error.message:'Unable to copy source reference.';}
  });
  bind('[data-n1m-export-catalogue]','click',()=>{
    void listBookNotes().then(notes=>{
      const markdown=researchNotebookCatalogueMarkdown(loadResearchCollections(),
        notes,workId=>host.bookTitle(workId));
      download('thiepn-research-collection-catalogue.md',markdown);
      host.notify('All-collection catalogue downloaded. Actual notebook content remains managed by Library V2 backup.');
    }).catch(error=>host.notify(error instanceof Error?error.message:'Cannot export the collection catalogue.'));
  });
  bind('[data-n1m-export-knowledge]','click',()=>{
    const collection=host.active();if(!collection)return;
    if(host.isDirty()){
      host.notify('Save your synthesis before exporting a knowledge summary. Draft content is not silently exported.');
      return;
    }
    void listBookNotes().then(notes=>{
      const saved=collection.synthesisId?notes.find(note=>note.id===collection.synthesisId):undefined;
      if(collection.synthesisId&&!saved)
        throw new Error('The native synthesis note is unavailable. Restore it before exporting.');
      const result=consolidateResearch(collection,notes,saved?.bodyMarkdown??'',
        loadResearchCollections(),id=>host.bookTitle(id));
      const text=researchKnowledgeMarkdown(collection,result,sourcesFor(collection,notes),saved);
      download('knowledge-'+safeFilename(collection.name)+'.md',text);
      host.notify('Saved research knowledge summary downloaded with source coverage and review questions.');
    }).catch(error=>host.notify(error instanceof Error?error.message:'Unable to export the knowledge summary.'));
  });
  bind('[data-n1m-export-questions]','click',()=>{
    const collection=host.active();if(!collection)return;
    const result=overview();
    if(!result)return;
    const questions=makeResearchReviewPrompts(result,20);
    const text=['# Review questions — '+collection.name,'',
      '> Original prompts for independent reflection; not graded, scored, or mastery evidence.',
      '> Drawn from the current local notebook and current (possibly unsaved) synthesis draft.','',
      ...questions.map((q,i)=>(i+1)+'. '+q.question+
        (q.sourceIds.length?'\n   Sources: '+q.sourceIds.map(id=>'note:'+id).join(', '):'')),
      ''].join('\n');
    download('review-questions-'+safeFilename(collection.name)+'.md',text);
    host.notify('Open-ended research questions downloaded. Nothing was graded or saved automatically.');
  });
  onCollectionChanged();
  return {
    onCollectionChanged,onNotesChanged,onDraftChanged,
    dispose(){
      if(scheduled)clearTimeout(scheduled);
      for(const off of listeners)off();
    },
  };
}
