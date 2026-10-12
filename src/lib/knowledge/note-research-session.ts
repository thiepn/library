/**
 * Deliberately session-only research work. This records a reader's temporary
 * triage choices, NEVER mastery, assessed reading or notebook mutations.
 * Session notes remain in sessionStorage for the current browser tab only.
 */
export const RESEARCH_SESSION_PREFIX='thiepn.library.research-session.v1.';
export type ResearchTriage='pending'|'reviewed'|'revisit';
export interface ResearchSession {
  version:1;
  collectionId:string;
  startedAt:string;
  updatedAt:string;
  cursor:string;
  entries:Array<{id:string;state:ResearchTriage}>;
}
const MAX=120;
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(v);
function valid(value:unknown,collectionId:string):value is ResearchSession {
  if(!value||typeof value!=='object')return false;
  const item=value as Partial<ResearchSession>;
  if(item.version!==1||item.collectionId!==collectionId
    ||!validId(item.cursor)||typeof item.startedAt!=='string'
    ||typeof item.updatedAt!=='string'
    ||!Number.isFinite(Date.parse(item.startedAt))
    ||!Number.isFinite(Date.parse(item.updatedAt))
    ||!Array.isArray(item.entries)||item.entries.length>MAX
    ||!item.entries.every(row=>row&&validId(row.id)
      &&['pending','reviewed','revisit'].includes(row.state))
    ||new Set(item.entries.map(row=>row.id)).size!==item.entries.length)return false;
  return item.entries.some(entry=>entry.id===item.cursor);
}
const key=(id:string)=>RESEARCH_SESSION_PREFIX+id;
export function readResearchSession(collectionId:string):ResearchSession|undefined {
  try {
    const raw=sessionStorage.getItem(key(collectionId));
    if(!raw)return undefined;
    const parsed:unknown=JSON.parse(raw);
    return valid(parsed,collectionId)?parsed:undefined;
  }catch{return undefined;}
}
export function newResearchSession(collectionId:string,noteIds:readonly string[]):ResearchSession|undefined {
  const ids=[...new Set(noteIds)].filter(validId).slice(0,MAX);
  if(!validId(collectionId)||!ids.length)return undefined;
  const now=new Date().toISOString();
  const session:ResearchSession={
    version:1,collectionId,startedAt:now,updatedAt:now,
    cursor:ids[0],entries:ids.map(id=>({id,state:'pending'})),
  };
  return session;
}
export function alignResearchSession(
  current:ResearchSession,availableIds:readonly string[],
):ResearchSession|undefined {
  const ids=[...new Set(availableIds)].filter(validId).slice(0,MAX);
  if(!ids.length)return undefined;
  const stored=new Map(current.entries.map(row=>[row.id,row.state]));
  const cursor=ids.includes(current.cursor)?current.cursor:ids[0];
  return {...current,cursor,entries:ids.map(id=>({id,state:stored.get(id)??'pending'}))};
}
export function moveResearchSession(
  session:ResearchSession,direction:1|-1,pendingOnly=false,
):ResearchSession {
  const entries=session.entries;
  const index=entries.findIndex(item=>item.id===session.cursor);
  for(let i=index+direction;i>=0&&i<entries.length;i+=direction){
    if(!pendingOnly||entries[i].state!=='reviewed')
      return {...session,cursor:entries[i].id,updatedAt:new Date().toISOString()};
  }
  return session;
}
export function markResearchSession(
  session:ResearchSession,state:ResearchTriage,
):ResearchSession {
  return {...session,updatedAt:new Date().toISOString(),
    entries:session.entries.map(row=>row.id===session.cursor?{...row,state}:row)};
}
export function researchSessionSummary(session:ResearchSession) {
  return {
    total:session.entries.length,
    reviewed:session.entries.filter(row=>row.state==='reviewed').length,
    revisit:session.entries.filter(row=>row.state==='revisit').length,
    pending:session.entries.filter(row=>row.state==='pending').length,
    position:session.entries.findIndex(row=>row.id===session.cursor)+1,
  };
}
export function storeResearchSession(session:ResearchSession):boolean {
  if(!valid(session,session.collectionId))return false;
  try{sessionStorage.setItem(key(session.collectionId),JSON.stringify(session));return true;}
  catch{return false;}
}
export function clearResearchSession(collectionId:string):void {
  try{sessionStorage.removeItem(key(collectionId));}catch{}
}
export function researchSessionMarkdown(
  session:ResearchSession,names:(id:string)=>string,
):string {
  const counts=researchSessionSummary(session);
  return [
    '# Temporary research review plan','',
    '> A manually exported review checklist. Review flags are self-reported, not assessed mastery.',
    '> No source notes or private reading events are included.','',
    'Collection ID: '+session.collectionId,
    'Session started: '+session.startedAt,
    'Reviewed: '+counts.reviewed+' / '+counts.total,'',
    ...session.entries.map((row,index)=>
      (row.state==='reviewed'?'- [x] ':'- [ ] ')+(index+1)+'. '+names(row.id)
      +(row.state==='revisit'?' — revisit':'')+' (note:'+row.id+')'),
    '',
  ].join('\n');
}
