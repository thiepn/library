/**
 * Browser-only workspace settings. IDs, bookmarks and display choices are
 * convenience metadata, never authoritative note documents, reading progress,
 * Account sync payloads or part of Library's existing V2 backup contract.
 */
export const NOTEBOOK_CONTINUITY_KEY='thiepn.library.notebook.continuity.v1';
export type NotebookReadingDensity='comfortable'|'compact';
export type NotebookCollectionOrder='recent'|'name'|'sources';
export interface NotebookContinuity {
  version:1;
  favoriteCollectionIds:string[];
  recentNoteIds:string[];
  lastCollectionId:string;
  density:NotebookReadingDensity;
  collectionOrder:NotebookCollectionOrder;
  showUncitedFirst:boolean;
}
const DEFAULT:NotebookContinuity={
  version:1,favoriteCollectionIds:[],recentNoteIds:[],
  lastCollectionId:'',density:'comfortable',collectionOrder:'recent',
  showUncitedFirst:false,
};
const id=(value:unknown):value is string=>typeof value==='string'
  && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const ids=(value:unknown,max:number):value is string[]=>
  Array.isArray(value)&&value.length<=max
  && value.every(id)&&new Set(value).size===value.length;
function valid(v:unknown):v is NotebookContinuity {
  if(!v||typeof v!=='object')return false;
  const p=v as Partial<NotebookContinuity>;
  return p.version===1&&ids(p.favoriteCollectionIds,30)
    &&ids(p.recentNoteIds,24)
    &&(p.lastCollectionId===''||id(p.lastCollectionId))
    &&(p.density==='comfortable'||p.density==='compact')
    &&['recent','name','sources'].includes(p.collectionOrder??'')
    &&typeof p.showUncitedFirst==='boolean';
}
export function readNotebookContinuity():NotebookContinuity {
  try{
    const raw=localStorage.getItem(NOTEBOOK_CONTINUITY_KEY);
    if(!raw)return {...DEFAULT};
    const decoded:unknown=JSON.parse(raw);
    return valid(decoded)?decoded:{...DEFAULT};
  }catch{return {...DEFAULT};}
}
export function saveNotebookContinuity(
  change:(state:NotebookContinuity)=>NotebookContinuity,
):NotebookContinuity {
  const candidate=change(readNotebookContinuity());
  if(!valid(candidate))throw new Error('Unsupported workspace preference.');
  try{localStorage.setItem(NOTEBOOK_CONTINUITY_KEY,JSON.stringify(candidate));}
  catch{throw new Error('Browser storage is not available for workspace preferences.');}
  window.dispatchEvent(new CustomEvent('library-notebook-preferences-changed'));
  return candidate;
}
export function setFavoriteResearchCollection(collectionId:string,enabled:boolean):NotebookContinuity {
  if(!id(collectionId))throw new Error('Invalid research collection identifier.');
  return saveNotebookContinuity(state=>({
    ...state,
    favoriteCollectionIds:enabled
      ?[...new Set([collectionId,...state.favoriteCollectionIds])].slice(0,30)
      :state.favoriteCollectionIds.filter(value=>value!==collectionId),
  }));
}
export function rememberNotebookNavigation(noteId:string):void {
  if(!id(noteId))return;
  try{saveNotebookContinuity(state=>({
    ...state,recentNoteIds:[noteId,...state.recentNoteIds.filter(n=>n!==noteId)].slice(0,24),
  }));}catch{/* Device preferences must never block opening notes. */}
}
export function rememberResearchCollection(collectionId:string):void {
  if(!id(collectionId))return;
  try{saveNotebookContinuity(state=>({...state,lastCollectionId:collectionId}));}
  catch{/* Collection navigation should still succeed. */}
}
export function orderResearchCollections<T extends {id:string;name:string;updatedAt:string;noteIds:readonly string[]}>(
  collections:readonly T[],preferences=readNotebookContinuity(),
):T[] {
  const favorites=new Set(preferences.favoriteCollectionIds);
  const sorted=[...collections];
  sorted.sort((a,b)=>{
    const pref=Number(favorites.has(b.id))-Number(favorites.has(a.id));
    if(pref)return pref;
    if(preferences.collectionOrder==='name')return a.name.localeCompare(b.name);
    if(preferences.collectionOrder==='sources')
      return b.noteIds.length-a.noteIds.length||a.name.localeCompare(b.name);
    return b.updatedAt.localeCompare(a.updatedAt)||a.name.localeCompare(b.name);
  });
  return sorted;
}
