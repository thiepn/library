import { applyNotebookMarkdownTool, notebookWordCount, type MarkdownTool } from './note-links';
import { getNotebookHeadings } from './note-outline';
import { noteReferenceMarkdown } from './note-links';
import {
  getSectionEvidenceContext, sectionEvidenceReviewMarkdown,
  type SectionEvidenceContext,
} from './note-research-n1s-evidence';
import { requestResearchView } from './note-research-n1q-view';
import {
  researchSynthesisSections, moveSynthesisSection, synthesisSectionTemplate,
  insertSynthesisSection, sectionWritingPacketMarkdown,
  type SynthesisSectionTemplate,
} from './note-research-n1r-sections';
import { researchReferences, researchBibliographyMarkdown } from './note-references';
import { researchBriefMarkdown, researchDossierMarkdown } from './note-research-handoff';
import { describeResearchSource, type ResearchCollection, type ResearchSource } from './note-research';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import {
  readResearchSession, newResearchSession, alignResearchSession, moveResearchSession,
  markResearchSession, researchSessionMarkdown, researchSessionSummary,
  storeResearchSession, clearResearchSession, type ResearchSession, type ResearchTriage,
} from './note-research-session';

export interface ResearchN1LHost {
  active():ResearchCollection|undefined;
  notes():readonly BookNoteDocumentV1[];
  synthesis():BookNoteDocumentV1|undefined;
  getDraft():{title:string;body:string};
  isDirty():boolean;
  setDraft(title:string,body:string):void;
  pins():{left:string;right:string};
  setPins(left:string,right:string):void;
  bookTitle(id:string):string;
  sourceHref(note:BookNoteDocumentV1):string|undefined;
  openNote(note:BookNoteDocumentV1):Promise<void>;
  collectNote(id:string):Promise<void>;
  notify(message:string):void;
}
export interface ResearchN1LController {
  onCollectionChanged():void;
  onNotesChanged():void;
  onDraftChanged():void;
  onSaved():void;
  dispose():void;
}

export function mountResearchN1L(root:HTMLElement,host:ResearchN1LHost):ResearchN1LController {
  const $=<T extends HTMLElement>(selector:string):T=>{
    const result=root.querySelector<T>(selector);
    if(!result)throw new Error('Missing research N1L element: '+selector);
    return result;
  };
  const progress=$<HTMLElement>('[data-research-session-progress]');
  const queue=$<HTMLElement>('[data-research-session-queue]');
  const exportFormat=$<HTMLSelectElement>('[data-research-export-format]');
  const synthBody=$<HTMLTextAreaElement>('[data-research-synthesis-body]');
  const outline=$<HTMLElement>('[data-research-outline]');
  const outlineCount=$<HTMLElement>('[data-research-outline-count]');
  const sectionPicker=$<HTMLSelectElement>('[data-n1r-section-picker]');
  const sectionTemplate=$<HTMLSelectElement>('[data-n1r-section-template]');
  const sectionStatus=$<HTMLElement>('[data-n1r-section-status]');
  const sectionUp=$<HTMLButtonElement>('[data-n1r-section-up]');
  const sectionDown=$<HTMLButtonElement>('[data-n1r-section-down]');
  const sectionInsert=$<HTMLButtonElement>('[data-n1r-section-insert]');
  const sectionExport=$<HTMLButtonElement>('[data-n1r-section-export]');
  const sectionSource=$<HTMLSelectElement>('[data-n1r-section-source]');
  const sectionPin=$<HTMLButtonElement>('[data-n1r-section-pin]');
  const sectionOpen=$<HTMLButtonElement>('[data-n1r-section-open]');
  const sectionReader=$<HTMLAnchorElement>('[data-n1r-section-reader]');
  const evidenceList=$<HTMLElement>('[data-n1s-evidence-list]');
  const evidenceCount=$<HTMLElement>('[data-n1s-evidence-count]');
  const evidenceStatus=$<HTMLElement>('[data-n1s-evidence-status]');
  const evidenceExport=$<HTMLButtonElement>('[data-n1s-evidence-export]');
  const callbacks:Array<()=>void>=[];
  let session:ResearchSession|undefined;
  let selectedSectionStart:number|undefined;
  let selectedSectionLabel='';
  let evidenceRefresh:ReturnType<typeof setTimeout>|undefined;
  let evidenceContext:SectionEvidenceContext|undefined;
  const bind=(sel:string,event:string,cb:EventListener)=>{
    const element=$(sel);element.addEventListener(event,cb);
    callbacks.push(()=>element.removeEventListener(event,cb));
  };
  const text=(tag:string,value:string)=>{
    const node=document.createElement(tag);node.textContent=value;return node;
  };
  const download=(filename:string,source:string)=>{
    const blob=new Blob([source],{type:'text/markdown;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
  const filename=(name:string)=>name.normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'research';
  const sourceById=()=>new Map(host.notes().map(note=>[note.id,note]));
  const orderedSources=():ResearchSource[]=>{
    const active=host.active(),byId=sourceById();
    if(!active)return [];
    return active.noteIds.flatMap(id=>{
      const note=byId.get(id);
      return note?[{
        note,bookTitle:host.bookTitle(note.workId),
        sourceLocation:describeResearchSource(note.anchor,note.chapterKey),
        sourceHref:host.sourceHref(note),
      }]:[];
    });
  };
  const sessionIds=()=>{
    const sourceIds=sourceById();
    return host.active()?.noteIds.filter(id=>sourceIds.has(id))??[];
  };
  function store(value:ResearchSession|undefined):void {
    session=value;
    if(!session)return;
    if(!storeResearchSession(session))
      host.notify('This tab cannot retain review progress. Use the checklist export.');
  }
  function setCursor(id:string):void {
    if(!session||!session.entries.some(item=>item.id===id))return;
    store({...session,cursor:id,updatedAt:new Date().toISOString()});
    const ids=session.entries.map(item=>item.id);
    const idx=ids.indexOf(id);
    const other=ids[idx+1]??ids[idx-1]??'';
    host.setPins(id,other);
    renderSession();
  }
  function renderSession():void {
    queue.replaceChildren();
    const active=host.active();
    const ids=sessionIds();
    const sessionEnabled=!!session && !!active;
    const summary=session?researchSessionSummary(session):undefined;
    progress.textContent=summary
      ? summary.reviewed+' reviewed · '+summary.revisit+' revisit · '
        +summary.pending+' pending of '+summary.total
      : 'No session started';
    $<HTMLButtonElement>('[data-research-session-start]').disabled=!active||!ids.length;
    for(const field of ['previous','next','reviewed','revisit','open','clear']){
      $<HTMLButtonElement>('[data-research-session-'+field+']').disabled=!sessionEnabled;
    }
    if(!session){queue.append(text('p','Start a session to make a temporary, ordered source-review checklist.'));return;}
    const docs=sourceById();
    for(const [index,entry] of session.entries.entries()){
      const doc=docs.get(entry.id);
      const row=document.createElement('button');
      row.type='button';
      row.className='book-notebook__n1l-session-entry';
      row.setAttribute('aria-current',String(entry.id===session.cursor));
      const name=doc?notebookTitle(doc):'Unavailable source';
      row.append(
        text('span',String(index+1).padStart(2,'0')),
        text('strong',name),
        text('small',entry.state==='reviewed'?'Reviewed':entry.state==='revisit'?'Revisit':'Pending'),
      );
      row.title=doc?host.bookTitle(doc.workId):'Note ID: '+entry.id;
      row.addEventListener('click',()=>setCursor(entry.id));
      queue.append(row);
    }
  }
  function onCollectionChanged():void {
    selectedSectionStart=undefined;
    selectedSectionLabel='';
    const active=host.active();
    session=active?readResearchSession(active.id):undefined;
    if(session){
      const reconciled=alignResearchSession(session,sessionIds());
      if(reconciled){
        store(reconciled);
        const ids=reconciled.entries.map(item=>item.id);
        const idx=ids.indexOf(reconciled.cursor);
        host.setPins(reconciled.cursor,ids[idx+1]??ids[idx-1]??'');
      } else session=undefined;
    }
    renderSession();renderOutline();renderExportState();
  }
  function onNotesChanged():void {
    if(session && session.collectionId===host.active()?.id) {
      const aligned=alignResearchSession(session,sessionIds());
      if(aligned)store(aligned);
      else session=undefined;
    }
    renderSession();renderOutline();renderExportState();
  }
  function renderOutline():void {
    outline.replaceChildren();
    const doc=host.synthesis();
    const draft=host.getDraft();
    const headings=doc?getNotebookHeadings(draft.body):[];
    outlineCount.textContent=headings.length
      ? headings.length+' headings · '+notebookWordCount(draft.body)+' words'
      : 'No headings';
    for(const heading of headings){
      const btn=document.createElement('button');
      btn.type='button';btn.textContent=heading.title;
      btn.style.paddingInlineStart=(11+(heading.level-1)*9)+'px';
      btn.title='Line '+heading.line;
      btn.addEventListener('click',()=>{
        synthBody.focus();
        synthBody.setSelectionRange(heading.offset,heading.offset);
        const line=synthBody.value.slice(0,heading.offset).split('\n').length;
        const approx=Math.max(0,line-4)*Math.max(18,parseFloat(getComputedStyle(synthBody).lineHeight)||25);
        synthBody.scrollTop=approx;
      });
      outline.append(btn);
    }
    if(!headings.length)outline.append(text('p','Use Markdown headings to navigate your synthesis.'));
    const sections=doc?researchSynthesisSections(draft.body):[];
    const previous=selectedSectionStart;
    sectionPicker.replaceChildren(new Option('Whole synthesis / append at end',''));
    for(const section of sections){
      sectionPicker.add(new Option(
        '  '.repeat(Math.max(0,section.level-1))+section.title
          +' ('+section.sourceIds.length+' linked notes)',
        String(section.start),
      ));
    }
    const chosen=sections.find(section=>section.start===previous
      &&section.title===selectedSectionLabel)
      ??(selectedSectionLabel
        ?[...sections].filter(section=>section.title===selectedSectionLabel)
          .sort((a,b)=>Math.abs(a.start-(previous??0))-Math.abs(b.start-(previous??0)))[0]
        :undefined);
    // Explicit section selection survives source links or paragraphs inserted above it.
    sectionPicker.value=chosen?String(chosen.start):'';
    if(chosen)selectedSectionStart=chosen.start;
    else {selectedSectionStart=undefined;selectedSectionLabel='';}
    sectionUp.disabled=!chosen||!sections.some(other=>other.parent===chosen.parent
      &&other.level===chosen.level&&other.start<chosen.start);
    sectionDown.disabled=!chosen||!sections.some(other=>other.parent===chosen.parent
      &&other.level===chosen.level&&other.start>chosen.start);
    sectionInsert.disabled=!doc;
    sectionExport.disabled=!doc||!chosen;
    renderSectionSourceOptions(chosen?.sourceIds??[]);
    scheduleEvidence();
  }
  function renderSectionSourceOptions(ids:readonly string[]):void {
    const previous=sectionSource.value;
    sectionSource.replaceChildren(new Option('Choose a section citation…',''));
    const saved=new Map(host.notes().map(note=>[note.id,note]));
    for(const id of ids){
      const note=saved.get(id);
      const label=note
        ?host.bookTitle(note.workId)+' — '+notebookTitle(note)+' · revision '+note.revision
        :'Unavailable local note · '+id;
      sectionSource.add(new Option(label,id));
    }
    sectionSource.value=ids.includes(previous)?previous:'';
    updateSectionSourceActions();
  }
  function updateSectionSourceActions():void {
    const note=host.notes().find(item=>item.id===sectionSource.value);
    sectionPin.disabled=!note||!host.active()?.noteIds.includes(note.id);
    sectionOpen.disabled=!note;
    const href=note?host.sourceHref(note):undefined;
    sectionReader.hidden=!href;
    if(href)sectionReader.href=href;
  }
  function selectSection():void {
    const number=Number(sectionPicker.value);
    selectedSectionStart=sectionPicker.value!==''&&Number.isFinite(number)
      ?number:undefined;
    selectedSectionLabel=researchSynthesisSections(host.getDraft().body)
      .find(section=>section.start===selectedSectionStart)?.title??'';
    renderOutline();
  }
  function selectedContext():SectionEvidenceContext|undefined {
    const active=host.active();
    if(!active||selectedSectionStart===undefined)return undefined;
    const body=host.getDraft().body;
    const index=researchSynthesisSections(body)
      .findIndex(section=>section.start===selectedSectionStart);
    return index<0?undefined:getSectionEvidenceContext(body,index,active,host.notes(),12);
  }
  function scheduleEvidence():void {
    if(evidenceRefresh)clearTimeout(evidenceRefresh);
    evidenceRefresh=setTimeout(()=>{evidenceRefresh=undefined;renderEvidence();},180);
  }
  function renderEvidence():void {
    const active=host.active();
    evidenceContext=selectedContext();
    const context=evidenceContext;
    evidenceList.replaceChildren();
    evidenceExport.disabled=!active||!context;
    if(!context){
      evidenceCount.textContent='Choose a synthesis section to inspect citations and related saved notes.';
      return;
    }
    evidenceCount.textContent=context.inCollectionIds.length+' collected links · '
      +context.outsideCollectionIds.length+' outside collection · '
      +context.unavailableIds.length+' unavailable · '
      +context.uncitedCollectionIds.length+' other collected sources';
    const byId=sourceById();
    const rowFor=(heading:string,detail:string,buttons:HTMLElement[]=[]):void=>{
      const row=document.createElement('article');
      row.className='book-notebook__n1s-evidence-row';
      const copy=document.createElement('div');
      copy.append(text('strong',heading),text('small',detail));
      const actions=document.createElement('div');
      actions.className='book-notebook__n1s-evidence-actions';
      actions.append(...buttons);
      row.append(copy,actions);evidenceList.append(row);
    };
    const btn=(label:string,callback:()=>void):HTMLButtonElement=>{
      const button=document.createElement('button');
      button.type='button';button.textContent=label;
      button.addEventListener('click',callback);
      return button;
    };
    if(!context.noteIds.length){
      rowFor('No source links in this section',
        'This is a reference gap, not an assessment of the claim. Choose a related note to inspect.');
    }
    for(const id of context.unavailableIds)
      rowFor('Missing source note · '+id,'The original local note could not be found. Restore it through the established Library V2 process.');
    for(const id of context.outsideCollectionIds){
      const source=byId.get(id);
      if(!source)continue;
      rowFor('Cited outside collection · '+notebookTitle(source),
        host.bookTitle(source.workId)+' · original revision '+source.revision,[
          btn('Collect reference',()=>{void collectSource(source);}),
          btn('Open note',()=>{void host.openNote(source);}),
        ]);
    }
    for(const suggestion of context.suggestions){
      const note=suggestion.note;
      const actions:HTMLElement[]=[
        btn('Pin / compare',()=>pinCandidate(note)),
        btn('Open note',()=>{void host.openNote(note);}),
      ];
      if(!suggestion.inCollection)
        actions.unshift(btn('Collect',()=>{void collectSource(note);}));
      else actions.unshift(btn('Cite in section',()=>insertCitationInSection(note)));
      const href=host.sourceHref(note);
      if(href){
        const link=document.createElement('a');
        link.href=href;link.target='_blank';link.rel='noopener noreferrer';
        link.textContent='Original reader';actions.push(link);
      }
      rowFor(host.bookTitle(note.workId)+' — '+notebookTitle(note),
        suggestion.relation.join(' · ')+' · '+(suggestion.inCollection
          ?'collected':'not yet collected'),actions);
    }
    if(!context.suggestions.length&&!context.unavailableIds.length
      &&!context.outsideCollectionIds.length)
      rowFor('No additional grounded suggestions',
        'Shared #topic markers, authored note links or matching heading/title terms would surface candidates here.');
  }
  async function collectSource(note:BookNoteDocumentV1):Promise<void> {
    const activeId=host.active()?.id;
    if(!activeId)return;
    try{
      await host.collectNote(note.id);
      if(host.active()?.id!==activeId){
        evidenceStatus.textContent='Collection changed; source references were not inserted.';
        return;
      }
      if(!host.active()?.noteIds.includes(note.id)){
        evidenceStatus.textContent='Collection reference was not saved; original note remains unchanged.';
        return;
      }
      evidenceStatus.textContent='Source added by stable ID. Inspect it before citing; the note itself is unchanged.';
      renderEvidence();
    }catch(error){
      evidenceStatus.textContent=error instanceof Error?error.message:'Unable to collect this note.';
    }
  }
  function pinCandidate(note:BookNoteDocumentV1):void {
    if(!host.active()?.noteIds.includes(note.id)){
      evidenceStatus.textContent='Collect this note first to pin it in the current research workspace.';
      return;
    }
    const previous=host.pins();
    host.setPins(note.id,previous.right===note.id?'':previous.right);
    requestResearchView(root,'sources','[data-research-compare]');
  }
  function insertCitationInSection(note:BookNoteDocumentV1):void {
    const current=selectedContext(),active=host.active();
    if(!host.synthesis()||!active?.noteIds.includes(note.id)||!current)return;
    const sections=researchSynthesisSections(host.getDraft().body);
    const section=sections[current.sectionIndex];
    if(!section)return;
    const original=host.getDraft().body;
    // Append within this section, never overwrite authored words or silently save.
    const before=original.slice(0,section.end);
    const after=original.slice(section.end);
    const prefix=before.endsWith('\n')?'\n':'\n\n';
    const addition=prefix+'Source to assess: '+noteReferenceMarkdown(note)+'\n';
    const revised=before+addition+after;
    if(revised.length>synthBody.maxLength){
      evidenceStatus.textContent='Native synthesis text limit reached; no changes were made.';
      return;
    }
    host.setDraft(host.getDraft().title,revised);
    synthBody.focus();
    synthBody.setSelectionRange(before.length+addition.length,before.length+addition.length);
    evidenceStatus.textContent='Stable-ID citation added to the working synthesis. Inspect the original and save explicitly.';
    renderOutline();
  }
  function reviseSection(body:string,caret:number,message:string):void {
    const title=host.getDraft().title;
    if(body.length>synthBody.maxLength){
      sectionStatus.textContent='The synthesis has reached the maximum native note length.';
      return;
    }
    host.setDraft(title,body);
    synthBody.focus();
    synthBody.setSelectionRange(caret,caret);
    sectionStatus.textContent=message+' Save synthesis to commit the revision.';
    renderOutline();
  }
  function onDraftChanged():void {renderOutline();renderExportState();}
  function onSaved():void {renderOutline();renderExportState();}
  function renderExportState():void {
    const active=host.active();
    $<HTMLButtonElement>('[data-research-export-selected]').disabled=!active;
  }

  bind('[data-n1s-evidence-export]','click',()=>{
    const active=host.active(),context=selectedContext(),synthesis=host.synthesis();
    if(!active||!context||!synthesis)return;
    const markdown=sectionEvidenceReviewMarkdown(context,active,host.notes(),host.bookTitle);
    download('section-evidence-'+filename(active.name)+'-'+(context.sectionIndex+1)+'.md',markdown);
    evidenceStatus.textContent='Local evidence worksheet download requested. No native notebook record was changed.';
  });
  bind('[data-n1r-section-picker]','change',selectSection);
  bind('[data-n1r-section-source]','change',updateSectionSourceActions);
  bind('[data-n1r-section-pin]','click',()=>{
    const note=host.notes().find(item=>item.id===sectionSource.value);
    const collection=host.active();
    if(!note||!collection?.noteIds.includes(note.id))return;
    const existing=host.pins();
    const other=existing.right!==note.id
      ?existing.right:collection.noteIds.find(id=>id!==note.id)??'';
    host.setPins(note.id,other);
    requestResearchView(root,'sources','[data-research-compare]');
    sectionStatus.textContent='Cited note pinned to Source A; no notebook content changed.';
  });
  bind('[data-n1r-section-open]','click',()=>{
    const note=host.notes().find(item=>item.id===sectionSource.value);
    if(!note)return;
    if(host.isDirty()&&!window.confirm(
      'The synthesis has unsaved writing. Save or download a draft before opening the source note? Cancel to stay in the editor.'))return;
    void host.openNote(note);
  });
  for(const [direction,button] of [[-1,sectionUp],[1,sectionDown]] as const){
    const cb=()=>{
      if(!host.synthesis()||selectedSectionStart===undefined)return;
      const textBody=host.getDraft().body;
      const sections=researchSynthesisSections(textBody);
      const index=sections.findIndex(section=>section.start===selectedSectionStart);
      if(index<0)return;
      const moved=moveSynthesisSection(textBody,index,direction);
      if(!moved){sectionStatus.textContent='This section has no adjacent sibling at its level.';return;}
      selectedSectionStart=moved.caret;
      reviseSection(moved.body,moved.caret,
        direction<0?'Section moved earlier':'Section moved later');
    };
    button.addEventListener('click',cb);
    callbacks.push(()=>button.removeEventListener('click',cb));
  }
  bind('[data-n1r-section-insert]','click',()=>{
    if(!host.synthesis())return;
    const template=sectionTemplate.value as SynthesisSectionTemplate;
    const source=host.notes().find(note=>note.id===host.pins().left);
    const markdown=synthesisSectionTemplate(template,source);
    const body=host.getDraft().body;
    const sections=researchSynthesisSections(body);
    const index=selectedSectionStart===undefined
      ?-1:sections.findIndex(section=>section.start===selectedSectionStart);
    try {
      const inserted=insertSynthesisSection(body,index,markdown,synthBody.maxLength);
      selectedSectionStart=undefined;
      reviseSection(inserted.body,inserted.caret,'Source-linked writing section inserted');
    }catch(error){
      sectionStatus.textContent=error instanceof Error?error.message:'Unable to insert section.';
    }
  });
  bind('[data-n1r-section-export]','click',()=>{
    const active=host.active(),synthesis=host.synthesis();
    if(!active||!synthesis||selectedSectionStart===undefined)return;
    const draft=host.getDraft();
    const sections=researchSynthesisSections(draft.body);
    const index=sections.findIndex(section=>section.start===selectedSectionStart);
    if(index<0){sectionStatus.textContent='Select an available heading.';return;}
    try {
      const markdown=sectionWritingPacketMarkdown(draft.body,index,
        host.notes(),host.bookTitle,{
          savedRevision:synthesis.revision,collectionName:active.name,
        });
      download('section-'+filename(active.name)+'-'+(index+1)+'.md',markdown);
      sectionStatus.textContent='Current editor section exported as a working copy, not a saved notebook revision.';
    }catch(error){
      sectionStatus.textContent=error instanceof Error?error.message:'Section export unavailable.';
    }
  });

  bind('[data-research-session-start]','click',()=>{
    const active=host.active();
    if(!active)return;
    if(session&&!window.confirm('Restart this tab’s research review queue? Previous self-reported review flags will be reset.'))return;
    store(newResearchSession(active.id,sessionIds()));
    if(session)setCursor(session.cursor);
    renderSession();
  });
  bind('[data-research-session-previous]','click',()=>{
    if(!session)return;
    const next=moveResearchSession(session,-1,false);
    setCursor(next.cursor);
  });
  bind('[data-research-session-next]','click',()=>{
    if(!session)return;
    const next=moveResearchSession(session,1,true);
    if(next.cursor===session.cursor)host.notify('End of this review queue. Select a source to revisit.');
    else setCursor(next.cursor);
  });
  const mark=(state:ResearchTriage)=>{
    if(!session)return;
    store(markResearchSession(session,state));
    if(state==='reviewed'){
      const next=moveResearchSession(session,1,true);
      if(next.cursor!==session.cursor)setCursor(next.cursor);
      else renderSession();
    }else renderSession();
  };
  bind('[data-research-session-reviewed]','click',()=>mark('reviewed'));
  bind('[data-research-session-revisit]','click',()=>mark('revisit'));
  bind('[data-research-session-open]','click',()=>{
    const doc=session&&sourceById().get(session.cursor);
    if(doc)void host.openNote(doc);
    else host.notify('This session source is unavailable on this device.');
  });
  bind('[data-research-session-clear]','click',()=>{
    const active=host.active();
    if(!active||!session)return;
    if(!window.confirm('End the temporary research session in this tab? Notebook notes remain unchanged.'))return;
    clearResearchSession(active.id);session=undefined;renderSession();
  });
  bind('[data-research-export-selected]','click',()=>{
    const active=host.active();
    if(!active)return;
    const format=exportFormat.value;
    if(format!=='session' && host.isDirty()){
      host.notify('Save your current synthesis first. Exports include only saved notebook revisions, not unsaved editor text.');
      return;
    }
    const sources=orderedSources();
    const saved=host.synthesis();
    const title=filename(active.name);
    if(format==='session'){
      if(!session){host.notify('Start a review session before exporting its checklist.');return;}
      const map=sourceById();
      download('research-session-'+title+'.md',
        researchSessionMarkdown(session,id=>map.has(id)
          ? notebookTitle(map.get(id)!):'Unavailable note'));
      host.notify('Temporary review checklist download requested, not an assessed progress record.');
      return;
    }
    if(format==='brief'){
      download('research-brief-'+title+'.md',researchBriefMarkdown(active,sources,saved));
    }else if(format==='dossier'){
      download('research-dossier-'+title+'.md',researchDossierMarkdown(active,sources,saved));
    }else if(format==='references'){
      download('research-references-'+title+'.md',researchBibliographyMarkdown(researchReferences(sources)));
    }else return;
    host.notify('Saved-source '+format+' download requested. Unsaved editor text was not exported; save synthesis separately.');
  });
  for(const btn of root.querySelectorAll<HTMLButtonElement>('[data-research-md-tool]')){
    const listener=()=>{
      if(!host.synthesis())return;
      const tool=btn.dataset.researchMdTool as MarkdownTool;
      const edit=applyNotebookMarkdownTool(synthBody.value,synthBody.selectionStart,
        synthBody.selectionEnd,tool);
      if(edit.value.length>synthBody.maxLength){
        host.notify('The synthesis reached the maximum note length.');return;
      }
      host.setDraft(host.getDraft().title,edit.value);
      synthBody.focus();
      synthBody.setSelectionRange(edit.selectionStart,edit.selectionEnd);
      onDraftChanged();
    };
    btn.addEventListener('click',listener);
    callbacks.push(()=>btn.removeEventListener('click',listener));
  }
  bind('[data-research-synthesis-body]','keydown',event=>{
    const key=event as KeyboardEvent;
    if((key.ctrlKey||key.metaKey)&&!key.altKey&&['b','i'].includes(key.key.toLowerCase())){
      key.preventDefault();
      root.querySelector<HTMLButtonElement>(
        '[data-research-md-tool="'+(key.key.toLowerCase()==='b'?'bold':'italic')+'"]'
      )?.click();
    }
  });

  renderSession();renderOutline();renderExportState();
  return {onCollectionChanged,onNotesChanged,onDraftChanged,onSaved,
    dispose(){
      if(evidenceRefresh)clearTimeout(evidenceRefresh);
      for(const off of callbacks)off();
    }};
}
