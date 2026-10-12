import { applyNotebookMarkdownTool, notebookWordCount, type MarkdownTool } from './note-links';
import { getNotebookHeadings } from './note-outline';
import { researchReferences, researchBibliographyMarkdown } from './note-references';
import { researchBriefMarkdown, researchDossierMarkdown } from './note-research-handoff';
import { type ResearchCollection, type ResearchSource } from './note-research';
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
  const callbacks:Array<()=>void>=[];
  let session:ResearchSession|undefined;
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
        sourceLocation:note.anchor?.format==='pdf'
          ? 'PDF page '+note.anchor.page
          :note.anchor?.format==='epub'
            ? 'EPUB '+(note.anchor.chapterLabel??note.anchor.chapterHref)
            :note.anchor?.format==='web'?'Web chapter '+note.anchor.chapterId
              :(note.chapterKey?'Chapter '+note.chapterKey:'Exact location not recorded'),
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
    const active=host.active();
    session=active?readResearchSession(active.id):undefined;
    if(session){
      const reconciled=alignResearchSession(session,sessionIds());
      if(reconciled)store(reconciled);
      else session=undefined;
    }
    renderSession();renderOutline();renderExportState();
  }
  function onNotesChanged():void {
    if(session) {
      const aligned=alignResearchSession(session,sessionIds());
      if(aligned)store(aligned);
      else session=undefined;
    }
    renderSession();renderExportState();
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
  }
  function onDraftChanged():void {renderOutline();renderExportState();}
  function onSaved():void {renderOutline();renderExportState();}
  function renderExportState():void {
    const active=host.active();
    $<HTMLButtonElement>('[data-research-export-selected]').disabled=!active;
  }

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
    dispose(){for(const off of callbacks)off();}};
}
