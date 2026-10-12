import { isBookNoteDocumentV1, type BookNoteDocumentV1 } from './note-model';
import {
  NOTEBOOK_COLLECTIONS_FORMAT, parseResearchCollectionIndex,
  type ResearchCollection,
} from './note-research';

/**
 * A research package carries immutable note snapshots for offline custody.
 * Importing this package NEVER writes note documents, changes revisions,
 * registers a cloud copy, or acts as a substitute for Library V2 restore.
 * The collection reference can be attached only after exact local matching.
 */
export const RESEARCH_PACKAGE_FORMAT='thiepn-library-research-package';
export interface PackageSource {
  id:string;
  workId:string;
  revision:number;
  updatedAt:string;
  sha256:string;
  role:'source'|'synthesis';
}
export interface ResearchPackageV1 {
  format:typeof RESEARCH_PACKAGE_FORMAT;
  version:1;
  exportedAt:string;
  collection:ResearchCollection;
  manifest:PackageSource[];
  notes:BookNoteDocumentV1[];
}
export interface PackageReconciliation {
  missing:string[];
  changed:string[];
  matching:string[];
  attachable:boolean;
  snapshotCount:number;
}
const hex=(bytes:ArrayBuffer):string=>
  [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
async function digest(text:string):Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
}
function snapshotKey(note:BookNoteDocumentV1):string {
  return JSON.stringify(note);
}
function validCollection(value:unknown):value is ResearchCollection {
  try {
    parseResearchCollectionIndex(JSON.stringify({
      format:NOTEBOOK_COLLECTIONS_FORMAT,schemaVersion:1,collections:[value],
    }));
    return true;
  } catch {return false;}
}
const validSource=(value:unknown):value is PackageSource=>{
  if(!value||typeof value!=='object')return false;
  const s=value as Partial<PackageSource>;
  return typeof s.id==='string' && typeof s.workId==='string'
    && Number.isSafeInteger(s.revision) && (s.revision??0)>0
    && typeof s.updatedAt==='string'
    && typeof s.sha256==='string' && /^[0-9a-f]{64}$/.test(s.sha256)
    && (s.role==='source'||s.role==='synthesis');
};
export async function exportResearchPackage(
  collection:ResearchCollection,all:readonly BookNoteDocumentV1[],
):Promise<string> {
  if(!validCollection(collection))throw new Error('The collection is not in the supported format.');
  const unique=[...new Set([...collection.noteIds,...(collection.synthesisId?[collection.synthesisId]:[])])];
  const lookup=new Map(all.map(note=>[note.id,note]));
  // No misleading partial package: collect or restore every source first.
  const missing=unique.filter(id=>!lookup.has(id));
  if(missing.length)throw new Error('Cannot export a complete research package: '+missing.length+' source notes are not available locally.');
  const notes=unique.map(id=>lookup.get(id)!);
  const manifest:PackageSource[]=await Promise.all(notes.map(async note=>({
    id:note.id,workId:note.workId,revision:note.revision,updatedAt:note.updatedAt,
    sha256:await digest(snapshotKey(note)),
    role:note.id===collection.synthesisId?'synthesis' as const:'source' as const,
  })));
  const packageData:ResearchPackageV1={
    format:RESEARCH_PACKAGE_FORMAT,version:1,exportedAt:new Date().toISOString(),
    collection,manifest,notes,
  };
  return JSON.stringify(packageData,null,2)+'\n';
}
export async function parseResearchPackage(raw:string):Promise<ResearchPackageV1> {
  if(raw.length>10_000_000)throw new Error('Research package exceeds the 10 MB reading limit.');
  let decoded:unknown;
  try {decoded=JSON.parse(raw);}catch{throw new Error('Research package is not valid JSON.');}
  if(!decoded||typeof decoded!=='object')throw new Error('Invalid research package.');
  const item=decoded as Partial<ResearchPackageV1>;
  if(item.format!==RESEARCH_PACKAGE_FORMAT||item.version!==1
    ||typeof item.exportedAt!=='string'||!Number.isFinite(Date.parse(item.exportedAt))
    ||!validCollection(item.collection)
    ||!Array.isArray(item.notes)||item.notes.length>121
    ||!item.notes.every(isBookNoteDocumentV1)
    ||!Array.isArray(item.manifest)||item.manifest.length!==item.notes.length
    ||!item.manifest.every(validSource))throw new Error('Unsupported or incomplete research package.');
  const required=[...new Set([...item.collection.noteIds,
    ...(item.collection.synthesisId?[item.collection.synthesisId]:[])])];
  if(required.length!==item.notes.length
    ||new Set(item.notes.map(n=>n.id)).size!==item.notes.length
    ||new Set(item.manifest.map(m=>m.id)).size!==item.manifest.length)
    throw new Error('Research package references do not form an exact note set.');
  const notesById=new Map(item.notes.map(n=>[n.id,n]));
  for(const entry of item.manifest){
    const note=notesById.get(entry.id);
    if(!note||!required.includes(entry.id)||entry.workId!==note.workId
      ||entry.revision!==note.revision||entry.updatedAt!==note.updatedAt
      ||entry.role!==(note.id===item.collection.synthesisId?'synthesis':'source')
      ||await digest(snapshotKey(note))!==entry.sha256)
      throw new Error('Research package custody hash or note identity mismatch.');
  }
  return item as ResearchPackageV1;
}
export async function reconcileResearchPackage(
  data:ResearchPackageV1,local:readonly BookNoteDocumentV1[],
):Promise<PackageReconciliation> {
  const localById=new Map(local.map(n=>[n.id,n]));
  const missing:string[]=[],changed:string[]=[],matching:string[]=[];
  for(const entry of data.manifest){
    const candidate=localById.get(entry.id);
    if(!candidate){missing.push(entry.id);continue;}
    const checksum=await digest(snapshotKey(candidate));
    if(candidate.workId!==entry.workId||checksum!==entry.sha256)
      changed.push(entry.id);
    else matching.push(entry.id);
  }
  return {
    missing,changed,matching,
    attachable:missing.length===0&&changed.length===0,
    snapshotCount:data.notes.length,
  };
}
