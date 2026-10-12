import { extractNotebookLinks } from './note-links';
import { extractNotebookTopics } from './note-workspace';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';

export interface NoteGraphNode {
  id: string;
  title: string;
  workId: string;
  x: number;
  y: number;
  topics: string[];
  outgoing: number;
  incoming: number;
}
export interface NoteGraphEdge {
  source: string;
  target: string;
  kind: 'reference' | 'topic';
  label?: string;
}
export interface NoteGraphData {
  nodes: NoteGraphNode[];
  edges: NoteGraphEdge[];
  omitted: number;
  workCount: number;
}
export interface NoteGraphOptions {
  limit?: number;
  focus?: string;
  includeSharedTopics?: boolean;
  workId?: string;
  topic?: string;
}

/**
 * Deterministic readable graph. Real Markdown note links are directional;
 * shared-topic edges are explicitly distinct, bounded visual suggestions.
 * Never creates persistent links or infers a relationship from a title alone.
 */
export function buildNoteGraph(
  notes: readonly BookNoteDocumentV1[], options: NoteGraphOptions = {},
): NoteGraphData {
  const limit = Math.max(8, Math.min(120, options.limit ?? 72));
  const all = new Map(notes.map(note => [note.id,note]));
  const candidates = notes.filter(note =>
    (!options.workId || options.workId === 'all' || note.workId === options.workId)
    && (!options.topic || options.topic === 'all'
      || extractNotebookTopics(note.bodyMarkdown).includes(options.topic)));
  const chosen = options.focus && all.has(options.focus)
    ? [...candidates].sort((a,b)=>{
        if (a.id === options.focus) return -1;
        if (b.id === options.focus) return 1;
        const aConnected = extractNotebookLinks(a.bodyMarkdown).some(link=>link.id===options.focus)
          || extractNotebookLinks(all.get(options.focus!)?.bodyMarkdown ?? '').some(link=>link.id===a.id);
        const bConnected = extractNotebookLinks(b.bodyMarkdown).some(link=>link.id===options.focus)
          || extractNotebookLinks(all.get(options.focus!)?.bodyMarkdown ?? '').some(link=>link.id===b.id);
        return Number(bConnected)-Number(aConnected)
          || b.updatedAt.localeCompare(a.updatedAt);
      })
    : [...candidates].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const displayed = chosen.slice(0,limit);
  const selected = new Set(displayed.map(note=>note.id));
  const groups = new Map<string,BookNoteDocumentV1[]>();
  for (const note of displayed) {
    const row = groups.get(note.workId) ?? [];
    row.push(note);
    groups.set(note.workId,row);
  }
  const nodes: NoteGraphNode[] = [];
  // Books occupy angular sectors; notes within a book form shallow concentric rings.
  let offset = 0;
  for (const [workId,group] of groups) {
    const width = (group.length / Math.max(displayed.length,1)) * Math.PI * 2;
    for (let index=0;index<group.length;index++) {
      const angle = -Math.PI/2 + offset + width*(index+.5)/group.length;
      const ring = index%3;
      const radius = displayed.length === 1 ? 0 : 175 + ring*73;
      const note=group[index];
      nodes.push({
        id:note.id,title:notebookTitle(note),workId,
        x:480+Math.cos(angle)*radius,y:300+Math.sin(angle)*radius,
        topics:extractNotebookTopics(note.bodyMarkdown),
        outgoing:0,incoming:0,
      });
    }
    offset+=width;
  }
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const edges:NoteGraphEdge[]=[];
  const edgeKeys=new Set<string>();
  for (const note of displayed) {
    for (const ref of extractNotebookLinks(note.bodyMarkdown)) {
      if (!selected.has(ref.id) || ref.id===note.id) continue;
      const key = note.id+'>'+ref.id;
      if (edgeKeys.has(key))continue;
      edgeKeys.add(key);
      edges.push({source:note.id,target:ref.id,kind:'reference'});
      byId.get(note.id)!.outgoing++;
      byId.get(ref.id)!.incoming++;
    }
  }
  if (options.includeSharedTopics) {
    const topicIndex=new Map<string,string[]>();
    for (const note of nodes) for(const topic of note.topics) {
      const bucket=topicIndex.get(topic)??[];
      bucket.push(note.id);topicIndex.set(topic,bucket);
    }
    // Never draw complete topic cliques: bounded chains stay intelligible.
    for(const [topic,ids] of topicIndex) {
      for(let i=1;i<ids.length && edges.length<250;i++) {
        const pair=[ids[i-1],ids[i]].sort();
        const key='topic:'+pair.join('|');
        if(edgeKeys.has(key))continue;
        edgeKeys.add(key);
        edges.push({source:ids[i-1],target:ids[i],kind:'topic',label:topic});
      }
    }
  }
  return {nodes,edges,omitted:Math.max(0,candidates.length-displayed.length),
    workCount:groups.size};
}

export function graphNeighbors(graph: NoteGraphData, id: string): Set<string> {
  const near = new Set<string>([id]);
  for(const edge of graph.edges) {
    if(edge.source===id)near.add(edge.target);
    if(edge.target===id)near.add(edge.source);
  }
  return near;
}
