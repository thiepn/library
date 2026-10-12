/**
 * Presentational orchestration of existing research features.
 * No new persistent state or competing writer. All existing N1A–N1P nodes
 * remain mounted, so evidence, recovery and citation actions keep their owners.
 */
export type ResearchView='browse'|'sources'|'write'|'review';
export interface ResearchReveal {
  view:ResearchView;
  selector?:string;
  focus?:boolean;
}
export function requestResearchView(
  root:HTMLElement,view:ResearchView,selector?:string,focus=false,
):void {
  root.dispatchEvent(new CustomEvent<ResearchReveal>('library-research-reveal',{
    bubbles:true,detail:{view,selector,focus},
  }));
}
export interface ResearchViewController {
  show(view:ResearchView,selector?:string,focus?:boolean):void;
  onCollectionChanged():void;
  onDraftChanged():void;
  dispose():void;
}
const viewSelectors:Record<ResearchView,readonly string[]>={
  browse:[
    '.book-notebook__research-create',
    '.book-notebook__n1o-hub',
    '[data-n1q-workspaces]',
    '[data-n1q-organize]',
    '.book-notebook__research-pick',
  ],
  sources:[
    '.book-notebook__research-sources',
    '.book-notebook__research-compare',
    '.book-notebook__bibliography',
    '.book-notebook__n1p-workflow',
  ],
  write:[
    '.book-notebook__n1p-comparison',
    '.book-notebook__n1o-evidence',
    '.book-notebook__n1m-consolidation',
    '.book-notebook__research-write',
  ],
  review:[
    '.book-notebook__n1p-review',
    '.book-notebook__n1l-session',
  ],
};
const modes:ResearchView[]=['browse','sources','write','review'];
export function mountResearchViews(
  root:HTMLElement,host:{
    active():{name:string;noteIds:readonly string[]}|undefined;
    synthesis():{revision:number}|undefined;
    dirty():boolean;
  },
):ResearchViewController {
  const tabs=root.querySelector<HTMLElement>('[data-n1q-tabs]');
  const indicator=root.querySelector<HTMLElement>('[data-n1q-view-state]');
  if(!tabs||!indicator)throw new Error('Unified research workspace navigation is missing.');
  const controls=new Map<ResearchView,HTMLButtonElement>();
  for(const view of modes){
    const button=tabs.querySelector<HTMLButtonElement>('[data-n1q-view="'+view+'"]');
    if(!button)throw new Error('Missing research view '+view);
    controls.set(view,button);
  }
  const panels=new Map<ResearchView,HTMLElement[]>();
  for(const view of modes){
    const list=viewSelectors[view].map(selector=>{
      const el=root.querySelector<HTMLElement>(selector);
      if(!el)throw new Error('Missing research work area '+selector);
      return el;
    });
    panels.set(view,list);
  }
  let active:ResearchView='browse';
  const callbacks:Array<()=>void>=[];
  function updateState():void {
    const collection=host.active();
    const suffix=collection
      ?' · '+collection.noteIds.length+' sources'
        +(host.synthesis()?' · synthesis revision '+host.synthesis()!.revision:'')
        +(host.dirty()?' · unsaved writing':'')
      :' · choose or create a collection';
    indicator.textContent={
      browse:'Discover notes and collections',
      sources:'Read and cite collected sources',
      write:'Develop your native synthesis',
      review:'Practice with temporary review queues',
    }[active]+suffix;
  }
  function show(view:ResearchView,selector?:string,focus=false):void {
    if(!modes.includes(view))return;
    active=view;
    for(const [mode,elements] of panels){
      for(const panel of elements)panel.hidden=mode!==view;
      const button=controls.get(mode)!;
      button.setAttribute('aria-pressed',String(mode===view));
      button.dataset.active=String(mode===view);
    }
    updateState();
    if(selector){
      const destination=root.querySelector<HTMLElement>(selector);
      if(destination){
        // Disclosures stay closed unless a workflow explicitly navigates into them.
        const disclosure=destination.closest<HTMLDetailsElement>('details[data-n1q-workspaces],details[data-n1q-organize]');
        if(disclosure)disclosure.open=true;
        const target=destination;
        // Reveal any collapsed native subsection, without changing its storage.
        requestAnimationFrame(()=>{
          target.scrollIntoView({behavior:'smooth',block:'center'});
          if(focus && 'focus' in target){
            if(!target.matches('input,textarea,select,button,a,[tabindex]'))
              target.setAttribute('tabindex','-1');
            target.focus({preventScroll:true});
          }
        });
      }
    }else{
      // Avoid jumping away from an active edit without explicit user navigation.
      tabs.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  }
  for(const view of modes){
    const button=controls.get(view)!;
    const cb=()=>show(view);
    button.addEventListener('click',cb);
    callbacks.push(()=>button.removeEventListener('click',cb));
  }
  const reveal=(event:Event)=>{
    const detail=(event as CustomEvent<ResearchReveal>).detail;
    if(detail?.view)show(detail.view,detail.selector,detail.focus);
  };
  root.addEventListener('library-research-reveal',reveal);
  const keys=(event:KeyboardEvent)=>{
    if(!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey)return;
    const view=modes[Number(event.key)-1];
    if(!view)return;
    event.preventDefault();show(view);
  };
  root.addEventListener('keydown',keys);
  callbacks.push(()=>{
    root.removeEventListener('library-research-reveal',reveal);
    root.removeEventListener('keydown',keys);
  });
  show('browse');
  return {
    show,
    onCollectionChanged:updateState,
    onDraftChanged:updateState,
    dispose(){for(const off of callbacks)off();},
  };
}
