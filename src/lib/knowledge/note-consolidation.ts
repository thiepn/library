import { extractNotebookLinks } from './note-links';
import { extractNotebookTopics } from './note-workspace';
import { getNotebookHeadings } from './note-outline';
import { notebookTitle, type BookNoteDocumentV1 } from './note-model';
import { describeResearchSource, type ResearchCollection, type ResearchSource } from './note-research';
import { researchBibliographyMarkdown, researchReferences } from './note-references';

export interface SourceCoverage {
  id:string;
  note?:BookNoteDocumentV1;
  title:string;
  book:string;
  location:string;
  topics:string[];
  cited:boolean;
  citationCount:number;
  referencedIn:string[];
}
export interface KnowledgeTopic {
  id:string;
  sources:SourceCoverage[];
  books:number;
}
export interface KnowledgeSection {
  title:string;
  level:number;
  line:number;
  offset:number;
  citations:string[];
}
export interface KnowledgeConsolidation {
  sources:SourceCoverage[];
  sections:KnowledgeSection[];
  topics:KnowledgeTopic[];
  citedCount:number;
  missingCount:number;
  uncitedCount:number;
  otherCollections:Array<{id:string;name:string;shared:number}>;
}
const referencePattern=(id:string)=>new RegExp('\\[\\[note:'+id+'(?:\\|[^\\]\\r\\n]*)?\\]\\]','g');
/** Connections are explicit written note references, not inferred evidence or grading. */
export function consolidateResearch(
  collection:ResearchCollection,
  notes:readonly BookNoteDocumentV1[],
  synthesisBody:string,
  collections:readonly ResearchCollection[]=[],
  workTitle:(workId:string)=>string=id=>id,
):KnowledgeConsolidation {
  const known=new Map(notes.map(note=>[note.id,note]));
  const synthRefs=extractNotebookLinks(synthesisBody);
  const links=new Set(synthRefs.map(ref=>ref.id));
  const headings=getNotebookHeadings(synthesisBody);
  const sections:KnowledgeSection[]=headings.map((heading,index)=>{
    const until=headings[index+1]?.offset??synthesisBody.length;
    const section=synthesisBody.slice(heading.offset,until);
    return {...heading,citations:extractNotebookLinks(section).map(ref=>ref.id)};
  });
  const sources=collection.noteIds.map(id=>{
    const note=known.get(id);
    const refs=sections.filter(section=>section.citations.includes(id)).map(section=>section.title);
    return {
      id,
      ...(note?{note}:{}),
      title:note?notebookTitle(note):'Unavailable notebook note',
      book:note?workTitle(note.workId):'Unknown book',
      location:note?describeResearchSource(note.anchor,note.chapterKey):'Source record missing locally',
      topics:note?extractNotebookTopics(note.bodyMarkdown):[],
      cited:links.has(id),
      citationCount:[...synthesisBody.matchAll(referencePattern(id))].length,
      referencedIn:refs,
    } satisfies SourceCoverage;
  });
  const topicsMap=new Map<string,SourceCoverage[]>();
  for(const source of sources){
    for(const topic of source.topics){
      const group=topicsMap.get(topic)??[];
      group.push(source);topicsMap.set(topic,group);
    }
  }
  const topics=[...topicsMap].map(([id,group])=>({
    id,sources:group,books:new Set(group.map(source=>source.note?.workId).filter(Boolean)).size,
  })).sort((a,b)=>b.sources.length-a.sources.length||a.id.localeCompare(b.id));
  const selected=new Set(collection.noteIds);
  const otherCollections=collections.filter(other=>other.id!==collection.id)
    .map(other=>({
      id:other.id,name:other.name,
      shared:other.noteIds.filter(id=>selected.has(id)).length,
    })).filter(other=>other.shared>0).sort((a,b)=>b.shared-a.shared);
  return {
    sources,sections,topics,
    citedCount:sources.filter(source=>source.cited).length,
    uncitedCount:sources.filter(source=>source.note&&!source.cited).length,
    missingCount:sources.filter(source=>!source.note).length,
    otherCollections,
  };
}

export interface ResearchReviewPrompt {
  id:string;
  label:string;
  question:string;
  sourceIds:string[];
}
/** Original, open-ended study prompts; none is claimed to be a graded question. */
export function makeResearchReviewPrompts(
  overview:KnowledgeConsolidation,limit=12,
):ResearchReviewPrompt[] {
  const prompts:ResearchReviewPrompt[]=[];
  for(const topic of overview.topics.filter(topic=>topic.sources.length>=2).slice(0,5)){
    prompts.push({
      id:'topic:'+topic.id,
      label:'Compare topic #'+topic.id,
      question:'How do these sources differ in their treatment of #'+topic.id
        +'? What passages or evidence support your comparison?',
      sourceIds:topic.sources.map(source=>source.id),
    });
  }
  for(const source of overview.sources.filter(source=>source.note&&!source.cited).slice(0,4)){
    prompts.push({
      id:'uncited:'+source.id,
      label:'Connect an uncited note',
      question:'What contribution, if any, does "'+source.title+'" make to your research question?'
        +' If relevant, add a precise note reference to your synthesis.',
      sourceIds:[source.id],
    });
  }
  if(overview.sources.length>=2){
    const [a,b]=overview.sources.filter(source=>source.note);
    if(a&&b)prompts.push({
      id:'compare-first-two',
      label:'Compare source arguments',
      question:'Where do "'+a.title+'" and "'+b.title
        +'" agree or differ, and what are the limits of the available evidence?',
      sourceIds:[a.id,b.id],
    });
  }
  if(overview.sections.length<2)prompts.push({
    id:'structure',label:'Improve synthesis structure',
    question:'Which main claim, evidence, alternative explanation, and open question deserve separate headings?',
    sourceIds:[],
  });
  prompts.push({
    id:'counterpoint',label:'Look for counterevidence',
    question:'Which source or observation would most seriously challenge your current synthesis?',
    sourceIds:[],
  });
  return prompts.slice(0,Math.max(1,Math.min(24,limit)));
}
export function researchKnowledgeMarkdown(
  collection:ResearchCollection,
  overview:KnowledgeConsolidation,
  sources:readonly ResearchSource[],
  synthesis?:BookNoteDocumentV1,
):string {
  const lines=[
    '# '+collection.name.replace(/[\r\n#]/g,' ').trim()+' — Knowledge summary','',
    '> Local notebook evidence map; references and review prompts are not verified factual claims.',
    '> Includes saved synthesis only, never unsaved editor text.',
    '',
    '## Collection context','',
    collection.description||'_No purpose recorded_','',
    '- Collected references: '+overview.sources.length,
    '- Available source notes: '+(overview.sources.length-overview.missingCount),
    '- Cited in saved synthesis: '+overview.citedCount,
    '- Available but uncited: '+overview.uncitedCount,
    '- Missing local source notes: '+overview.missingCount,'',
    '## Themes across books','',
  ];
  if(!overview.topics.length)lines.push('_No explicit #topic markers found._','');
  for(const topic of overview.topics){
    lines.push('### #'+topic.id+' · '+topic.sources.length+' notes · '+topic.books+' books','',
      ...topic.sources.map(source=>'- '+source.book+' — '+source.title+' (note:'+source.id+')'),'');
  }
  lines.push('## Source-to-synthesis coverage','');
  for(const source of overview.sources){
    lines.push('- '+(source.note?(source.cited?'Referenced':'Not yet referenced'):'Unavailable')
      +' · '+source.book+' — '+source.title+' · note:'+source.id
      +' · '+source.location);
  }
  lines.push('','## Saved synthesis outline','');
  if(overview.sections.length)for(const section of overview.sections)
    lines.push('- '+section.title+' (line '+section.line+') · '
      +section.citations.length+' linked note reference(s)');
  else lines.push('_No Markdown headings in saved synthesis._');
  lines.push('','## Independent review questions','',
    ...makeResearchReviewPrompts(overview).map((prompt,index)=>
      (index+1)+'. '+prompt.question+
      (prompt.sourceIds.length?' ('+prompt.sourceIds.map(id=>'note:'+id).join(', ')+')':'')),
    '','## Saved synthesis','',
    synthesis?.bodyMarkdown.trim()||'_No saved synthesis document is associated with this collection._',
    '','## Source register','',
    researchBibliographyMarkdown(researchReferences(sources)));
  return lines.join('\n').trim()+'\n';
}
