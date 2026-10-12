import { extractNotebookTopics } from './note-workspace';
import { extractNotebookLinks } from './note-links';
import { notebookTitle, type BookNoteDocumentV1, type SourceAnchorV1 } from './note-model';

/**
 * Local-only research collections. These are references to existing authoritative
 * notebook documents, not copies or a parallel note store.
 * Collections are NOT silently included in the established V2 Library backup:
 * export the separate collection index explicitly when transferring devices.
 */
export const NOTEBOOK_COLLECTIONS_KEY = 'thiepn.library.notebook.collections.v1';
export const NOTEBOOK_COLLECTIONS_FORMAT = 'thiepn-library-research-collections';
export interface ResearchWorkflow {
  id: string;
  label: string;
  purpose: string;
  sections: string;
}
export const RESEARCH_WORKFLOWS: readonly ResearchWorkflow[] = [
  {
    id:'open-research',label:'Open research',
    purpose:'Start with an open question and connect evidence across books.',
    sections:'## Research question\n\n\n## Observations and evidence\n\n\n## Differences across sources\n\n\n## Synthesis in my own words\n\n\n## Open questions\n\n- ',
  },
  {
    id:'compare-authors',label:'Compare authors',
    purpose:'Identify where authors agree, differ, or address different questions.',
    sections:'## Common question\n\n\n## Author A — main argument\n\n\n## Author B — main argument\n\n\n## Agreements\n\n\n## Disagreements and limits\n\n\n## My conclusion\n\n',
  },
  {
    id:'argument-review',label:'Evaluate an argument',
    purpose:'Separate claims, support, assumptions, counterarguments and conclusions.',
    sections:'## Core claim\n\n\n## Evidence offered\n\n\n## Assumptions\n\n\n## Counterarguments\n\n\n## My assessment\n\n\n## Remaining uncertainty\n\n',
  },
  {
    id:'discussion-prep',label:'Discussion preparation',
    purpose:'Bring multiple readings into a study or discussion session.',
    sections:'## Theme and opening question\n\n\n## Passages and source evidence\n\n\n## Discussion questions\n\n1. \n2. \n3. \n\n## Points of disagreement\n\n\n## Follow-up actions\n\n- [ ] ',
  },
];
const MAX_COLLECTIONS = 30;
const MAX_ENTRIES = 120;
export interface ResearchCollection {
  id: string;
  name: string;
  description: string;
  workflowId?: string;
  noteIds: string[];
  synthesisId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface ResearchCollectionIndex {
  format: typeof NOTEBOOK_COLLECTIONS_FORMAT;
  schemaVersion: 1;
  collections: ResearchCollection[];
}
const isObj=(value:unknown):value is Record<string,unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validTime=(s:unknown):s is string=>typeof s==='string' && Number.isFinite(Date.parse(s));
const validId=(s:unknown):s is string=>typeof s==='string' && /^[A-Za-z0-9_-]{1,180}$/.test(s);
const validCollection=(item:unknown):item is ResearchCollection=>{
  if(!isObj(item) || !validId(item.id)
    || typeof item.name!=='string' || !item.name.trim() || item.name.length>100
    || typeof item.description!=='string' || item.description.length>800
    || (item.workflowId!==undefined && (typeof item.workflowId!=='string'
      || !RESEARCH_WORKFLOWS.some(workflow=>workflow.id===item.workflowId)))
    || !validTime(item.createdAt) || !validTime(item.updatedAt)
    || !Array.isArray(item.noteIds) || item.noteIds.length>MAX_ENTRIES
    || !item.noteIds.every(validId) || new Set(item.noteIds).size!==item.noteIds.length
    || (item.synthesisId!==undefined && !validId(item.synthesisId)))return false;
  return true;
};
export function parseResearchCollectionIndex(raw:string):ResearchCollectionIndex {
  let parsed:unknown;
  try {parsed=JSON.parse(raw);} catch {throw new Error('Invalid collection index JSON.');}
  if(!isObj(parsed) || parsed.format!==NOTEBOOK_COLLECTIONS_FORMAT || parsed.schemaVersion!==1
    || !Array.isArray(parsed.collections) || parsed.collections.length>MAX_COLLECTIONS
    || !parsed.collections.every(validCollection))throw new Error('Unsupported collection index.');
  const collections=parsed.collections as ResearchCollection[];
  if(new Set(collections.map(collection=>collection.id)).size!==collections.length)
    throw new Error('Duplicate collection identifiers.');
  return {format:NOTEBOOK_COLLECTIONS_FORMAT,schemaVersion:1,collections};
}
export function loadResearchCollections():ResearchCollection[] {
  try {
    const raw=localStorage.getItem(NOTEBOOK_COLLECTIONS_KEY);
    return raw?parseResearchCollectionIndex(raw).collections:[];
  } catch {return [];}
}
function writeAll(items:ResearchCollection[]):ResearchCollection[] {
  const data:ResearchCollectionIndex={
    format:NOTEBOOK_COLLECTIONS_FORMAT,schemaVersion:1,collections:items,
  };
  // Validate the exact serialized representation before persisting.
  const serialized=JSON.stringify(data);
  parseResearchCollectionIndex(serialized);
  try {localStorage.setItem(NOTEBOOK_COLLECTIONS_KEY,serialized);}
  catch {throw new Error('Local collection preferences could not be saved.');}
  return items;
}
export function createResearchCollection(
  name:string,description='',workflowId='open-research',
):ResearchCollection {
  const title=name.normalize('NFKC').trim().slice(0,100);
  if(!title)throw new Error('Enter a name for this collection.');
  if(!RESEARCH_WORKFLOWS.some(workflow=>workflow.id===workflowId))
    throw new Error('Select a valid research workflow.');
  const all=loadResearchCollections();
  if(all.length>=MAX_COLLECTIONS)throw new Error('The 30 collection limit has been reached.');
  const now=new Date().toISOString();
  const record:ResearchCollection={
    id:crypto.randomUUID(),name:title,description:description.trim().slice(0,800),
    workflowId,noteIds:[],createdAt:now,updatedAt:now,
  };
  writeAll([record,...all]);
  return record;
}
export function updateResearchCollection(
  id:string, change:(existing:ResearchCollection)=>ResearchCollection,
):ResearchCollection {
  const all=loadResearchCollections();
  const index=all.findIndex(c=>c.id===id);
  if(index<0)throw new Error('Collection unavailable on this device.');
  const original=all[index];
  const candidate=change({
    ...original,noteIds:[...original.noteIds],
  });
  const updated:ResearchCollection={
    ...candidate,id:original.id,createdAt:original.createdAt,updatedAt:new Date().toISOString(),
  };
  const next=[...all];
  next[index]=updated;
  writeAll(next);
  return updated;
}
/** Organize the reference index only; never modifies native notebook documents. */
export function renameResearchCollection(
  id:string,name:string,description:string,workflowId?:string,
):ResearchCollection {
  const title=name.normalize('NFKC').trim().slice(0,100);
  if(!title)throw new Error('Enter a collection name.');
  if(description.length>800)throw new Error('Collection descriptions are limited to 800 characters.');
  if(workflowId!==undefined && !RESEARCH_WORKFLOWS.some(item=>item.id===workflowId))
    throw new Error('Unknown research workflow.');
  return updateResearchCollection(id,c=>({
    ...c,name:title,description:description.trim(),
    ...(workflowId?{workflowId}:{}),
  }));
}

/** Creates a second collection referencing the same notes, but with no synthesis writer ownership. */
export function duplicateResearchCollection(id:string):ResearchCollection {
  const original=loadResearchCollections().find(c=>c.id===id);
  if(!original)throw new Error('Research collection unavailable.');
  const copy=createResearchCollection(
    (original.name+' — copy').slice(0,100),original.description,
    original.workflowId??'open-research',
  );
  return setResearchCollectionNotes(copy.id,original.noteIds);
}

/** Copy a stable source note reference between collections without copying note content. */
export function copyResearchNoteToCollection(
  sourceId:string,targetCollectionId:string,
):ResearchCollection {
  if(!validId(sourceId))throw new Error('Invalid source-note reference.');
  return updateResearchCollection(targetCollectionId,c=>{
    if(c.noteIds.includes(sourceId))return c;
    if(c.noteIds.length>=MAX_ENTRIES)throw new Error('Destination collection has reached 120 notes.');
    return {...c,noteIds:[...c.noteIds,sourceId]};
  });
}

export function setResearchCollectionNotes(id:string,noteIds:readonly string[]):ResearchCollection {
  const dedup=[...new Set(noteIds)];
  if(dedup.length>MAX_ENTRIES)throw new Error('A collection supports at most 120 notes.');
  if(!dedup.every(validId))throw new Error('Invalid note identifier.');
  return updateResearchCollection(id,c=>({...c,noteIds:dedup}));
}
export function deleteResearchCollection(id:string):void {
  const all=loadResearchCollections();
  if(!all.some(c=>c.id===id))throw new Error('Collection already unavailable.');
  writeAll(all.filter(c=>c.id!==id));
}
export function exportResearchCollectionIndex(collections=loadResearchCollections()):string {
  return JSON.stringify({
    format:NOTEBOOK_COLLECTIONS_FORMAT,schemaVersion:1,collections,
  } satisfies ResearchCollectionIndex,null,2)+'\n';
}
export function importResearchCollectionIndex(raw:string):ResearchCollection[] {
  const imported=parseResearchCollectionIndex(raw).collections;
  const current=loadResearchCollections();
  // Merge by ID; do not delete collections not present in the import.
  const merged=new Map(current.map(c=>[c.id,c]));
  for(const c of imported)merged.set(c.id,c);
  if(merged.size>MAX_COLLECTIONS)
    throw new Error('The imported index exceeds the combined 30-collection limit.');
  return writeAll([...merged.values()]);
}
export interface ResearchSource {
  note:BookNoteDocumentV1;
  bookTitle:string;
  sourceLocation:string;
  sourceHref?:string;
}
export function describeResearchSource(anchor:SourceAnchorV1|undefined,chapterKey?:string):string {
  if(anchor?.format==='pdf')return 'PDF page '+anchor.page+' · edition '+anchor.edition+' · '+anchor.releaseVersion;
  if(anchor?.format==='epub')return 'EPUB '+(anchor.chapterLabel||anchor.chapterHref)
    +(anchor.cfi?' · CFI '+anchor.cfi:'')+' · edition '+anchor.edition+' · '+anchor.releaseVersion;
  if(anchor?.format==='web')return 'Web chapter '+anchor.chapterId;
  return chapterKey?'Chapter '+chapterKey:'Book-level note (exact location not recorded)';
}
function mdText(value:string):string{return value.replace(/[\r\n]+/g,' ').replace(/[\[\]]/g,'').trim();}
export function groupedResearchMarkdown(
  collection:ResearchCollection,
  sources:readonly ResearchSource[],
  synthesis?:BookNoteDocumentV1,
):string {
  const byId=new Map(sources.map(s=>[s.note.id,s]));
  const rows=[
    '# '+mdText(collection.name),
    '',
    collection.description.trim()||'_No project description_',
    '',
    '**Workflow:** '+(RESEARCH_WORKFLOWS.find(w=>w.id===collection.workflowId)?.label??'Open research'),
    '',
    '> THIEPN Library research collection · Markdown export',
    '> Book notes remain separately editable in Library. Missing local sources are identified below.',
    '',
    '## Sources by book',
    '',
  ];
  const groups=new Map<string,ResearchSource[]>();
  const missing:string[]=[];
  for(const id of collection.noteIds) {
    const source=byId.get(id);
    if(!source){missing.push(id);continue;}
    const group=groups.get(source.bookTitle)??[];
    group.push(source);groups.set(source.bookTitle,group);
  }
  for(const [bookName,group] of groups) {
    rows.push('### '+mdText(bookName),'');
    for(const source of group) {
      const note=source.note;
      rows.push('#### '+mdText(notebookTitle(note)),
        '',
        '**Note ID:** '+note.id,
        '**Location:** '+mdText(source.sourceLocation),
        '**Updated:** '+note.updatedAt,
        '**Topics:** '+(extractNotebookTopics(note.bodyMarkdown).map(topic=>'#topic/'+topic).join(', ')||'None'),
        '**Links:** '+(extractNotebookLinks(note.bodyMarkdown).map(link=>'note:'+link.id).join(', ')||'None'),
      );
      if(source.sourceHref)rows.push('**Open source:** '+source.sourceHref);
      rows.push('',note.bodyMarkdown.trim(),'','---','');
    }
  }
  if(!groups.size)rows.push('_No notes saved to this collection._','');
  if(missing.length)rows.push('## Unavailable local notes','',...missing.map(id=>'- Missing note ID: '+id),'');
  if(synthesis)rows.push('## Research synthesis','',
    '**Native notebook note:** '+synthesis.id,'',synthesis.bodyMarkdown.trim(),'');
  return rows.join('\n').trim()+'\n';
}
export function researchSynthesisBody(
  collection:ResearchCollection,sources:readonly ResearchSource[],
):string {
  const list=sources.map(source=>
    '- [[note:'+source.note.id+'|'+mdText(notebookTitle(source.note)).replace(/\|/g,' ')+']] — '
    +mdText(source.bookTitle)+'; '+mdText(source.sourceLocation));
  const workflow = RESEARCH_WORKFLOWS.find(item=>item.id===collection.workflowId)
    ?? RESEARCH_WORKFLOWS[0];
  return [
    workflow.sections,
    '',
    '## Linked source notes','',...list,'',
  ].join('\n');
}
