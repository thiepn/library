/**
 * Ephemeral synthesis recovery lives in this tab's sessionStorage, never in
 * Account sync, collection metadata, IndexedDB or the V2 backup. A recovered
 * draft is never written until the user explicitly saves through note-store
 * revision CAS. An optional Markdown download remains the durable fallback.
 */
export const RESEARCH_DRAFT_PREFIX='thiepn.library.research-draft.v1.';
export interface ResearchDraftCheckpoint {
  version:1;
  collectionId:string;
  noteId:string;
  baseRevision:number;
  title:string;
  bodyMarkdown:string;
  savedAt:string;
}
function key(collectionId:string,noteId:string):string {
  return RESEARCH_DRAFT_PREFIX+collectionId+'.'+noteId;
}
function valid(value:unknown):value is ResearchDraftCheckpoint {
  if(!value||typeof value!=='object')return false;
  const item=value as Partial<ResearchDraftCheckpoint>;
  return item.version===1 && typeof item.collectionId==='string'
    && item.collectionId.length>0 && item.collectionId.length<=180
    && typeof item.noteId==='string' && item.noteId.length>0 && item.noteId.length<=180
    && Number.isSafeInteger(item.baseRevision) && (item.baseRevision??0)>0
    && typeof item.title==='string' && item.title.length<=200
    && typeof item.bodyMarkdown==='string' && item.bodyMarkdown.length<=250000
    && typeof item.savedAt==='string' && Number.isFinite(Date.parse(item.savedAt));
}
export function saveResearchDraftCheckpoint(
  collectionId:string,noteId:string,baseRevision:number,title:string,bodyMarkdown:string,
):boolean {
  if(!valid({version:1,collectionId,noteId,baseRevision,title,bodyMarkdown,
    savedAt:new Date().toISOString()}))return false;
  try {
    sessionStorage.setItem(key(collectionId,noteId),JSON.stringify({
      version:1,collectionId,noteId,baseRevision,title,bodyMarkdown,
      savedAt:new Date().toISOString(),
    } satisfies ResearchDraftCheckpoint));
    return true;
  } catch {return false;}
}
export function readResearchDraftCheckpoint(
  collectionId:string,noteId:string,
):ResearchDraftCheckpoint|undefined {
  try {
    const data=sessionStorage.getItem(key(collectionId,noteId));
    if(!data)return undefined;
    const candidate:unknown=JSON.parse(data);
    if(!valid(candidate)||candidate.collectionId!==collectionId||candidate.noteId!==noteId)return undefined;
    return candidate;
  } catch{return undefined;}
}
export function clearResearchDraftCheckpoint(collectionId:string,noteId:string):void {
  try{sessionStorage.removeItem(key(collectionId,noteId));}catch{}
}
function oneLine(text:string):string {
  return text.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
}
export function researchRecoveryMarkdown(draft:ResearchDraftCheckpoint):string {
  const title=oneLine(draft.title).replace(/^#+\s*/,'')||'Untitled synthesis';
  return [
    '---',
    'thiepn_research_recovery: true',
    'collection_id: '+JSON.stringify(draft.collectionId),
    'note_id: '+JSON.stringify(draft.noteId),
    'base_revision: '+draft.baseRevision,
    'saved_at: '+JSON.stringify(draft.savedAt),
    '---',
    '',
    '# '+title,
    '',
    '> Unsaved synthesis recovery text. Not an authoritative Library note.',
    '> Verify the source revision before manually transferring this text.',
    '',
    draft.bodyMarkdown,
    '',
  ].join('\n');
}
