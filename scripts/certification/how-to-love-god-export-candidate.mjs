// Versioned, unpublished Book 1 export candidate fidelity gate.
// No release manifest, activeRelease, R2 or deployed assets modified.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {DOMParser} from '@xmldom/xmldom';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const VERSION='1.1.1-rc.1';
assert.equal(process.env.BOOK1_CANDIDATE_VERSION,VERSION);
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.join(process.env.RUNNER_TEMP||'/tmp','book1-format-qa');
const out=path.join(process.env.RUNNER_TEMP||'/tmp','book1-versioned-export',VERSION);
await mkdir(out,{recursive:true,mode:0o700});
const work=await readFile('src/content/works/how-to-love-god/work.yaml','utf8');
const release=await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8');
assert.match(work,/^id: how-to-love-god$/m);
assert.match(work,/^  activeRelease: 1\.1\.0$/m);
assert.match(release,/^version: 1\.1\.0$/m);
const basedir='src/content/works/how-to-love-god/chapters';
const names=(await readdir(basedir)).filter(x=>x.endsWith('.md')).sort();
assert.equal(names.length,51);
const sources=await Promise.all(names.map(n=>readFile(path.join(basedir,n),'utf8')));
const sourceSha=sha(Buffer.from(names.map((n,i)=>n+'\0'+sources[i].length+'\0'+sources[i]+'\n').join('')));
const fields=sources.map((src,i)=>{
 const fm=src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);assert.ok(fm,'frontmatter '+names[i]);
 const field=k=>fm[1].match(new RegExp('^'+k+':\\s*(.+)$','m'))?.[1]?.trim()?.replace(/^['"]|['"]$/g,'');
 return {id:field('id'),title:field('title'),order:Number(field('order')),file:names[i]};
}).sort((a,b)=>a.order-b.order);
assert.equal(new Set(fields.map(x=>x.id)).size,51);
const media=JSON.parse(await readFile(path.join(root,'media-verification.json'),'utf8'));
assert.equal(media.length,7);
assert.ok(media.every(x=>x.verified===true));
const paths=[
 {kind:'epub',src:path.join(root,'how-to-love-god-UNPUBLISHED-QA.epub'),name:'How_to_Love_God_'+VERSION+'_UNPUBLISHED.epub',mime:'application/epub+zip'},
 {kind:'pdf',src:path.join(root,'how-to-love-god-PDFUA-FINAL-QA.pdf'),name:'How_to_Love_God_'+VERSION+'_UNPUBLISHED.pdf',mime:'application/pdf'}
];
const files={};
for(const x of paths){
 const buf=await readFile(x.src);assert.ok(buf.length>100000);
 const dest=path.join(out,x.name);await copyFile(x.src,dest);
 assert.equal(sha(buf),sha(await readFile(dest)));
 files[x.kind]={filename:x.name,sha256:sha(buf),bytes:buf.length,mime:x.mime};
}
const zip=await JSZip.loadAsync(await readFile(path.join(out,paths[0].name)),{checkCRC32:true});
assert.equal(Object.keys(zip.files).filter(x=>!x.endsWith('/')).length,63);
const parse=new DOMParser({onError:(lvl,msg)=>{throw Error('XML '+lvl+': '+msg);}});
const opf=parse.parseFromString(await zip.file('OEBPS/content.opf').async('string'),'application/xml');
assert.equal(opf.getElementsByTagName('itemref').length,52);
const ebookTitle=opf.getElementsByTagName('dc:title').item(0)?.textContent?.trim();
assert.ok(ebookTitle?.includes(VERSION)&&ebookTitle?.toLowerCase().includes('unpublished'));
const nav=parse.parseFromString(await zip.file('OEBPS/nav.xhtml').async('string'),'application/xhtml+xml');
assert.equal(nav.getElementsByTagName('a').length,52);
const titles=new Map();let figureCount=0,imageCount=0;
for(const c of fields){
 const file='OEBPS/text/'+c.id+'.xhtml';
 const dom=parse.parseFromString(await zip.file(file).async('string'),'application/xhtml+xml');
 const h1=dom.getElementsByTagName('h1').item(0)?.textContent?.trim();
 assert.equal(h1,c.title,'source/EPUB heading '+file);
 titles.set(c.id,h1);
 assert.equal(dom.getElementsByTagName('main').length,1);
 assert.equal(dom.documentElement.getAttribute('xml:lang'),'en');
 for(const fig of Array.from(dom.getElementsByTagName('figure'))){
  const img=fig.getElementsByTagName('img').item(0),cap=fig.getElementsByTagName('figcaption').item(0);
  assert.ok(img?.getAttribute('alt')?.trim());
  assert.ok(cap?.textContent?.trim().startsWith('Figure — '));
  figureCount++;
 }
 imageCount+=dom.getElementsByTagName('img').length;
}
assert.equal(titles.size,51);assert.equal(figureCount,6);assert.equal(imageCount,6);
for(const x of media){
 const buf=await zip.file('OEBPS/images/'+x.name)?.async('nodebuffer');
 assert.ok(buf,'Original image missing '+x.key);
 assert.equal(buf.length,x.size);
 assert.equal(sha(buf),x.sha256,'Image checksum differs: '+x.key);
}
assert.equal(parse.parseFromString(await zip.file('OEBPS/cover.xhtml').async('string'),'application/xhtml+xml').getElementsByTagName('img').length,1);
const pdffile=path.join(out,paths[1].name);
const document=await getDocument({data:new Uint8Array(await readFile(pdffile)),useSystemFonts:true,isEvalSupported:false,disableFontFace:true}).promise;
let pages=0,links=0,notes=0,allText='';
try{
 pages=document.numPages;assert.equal(pages,245);
 for(let n=1;n<=pages;n++){
  const page=await document.getPage(n);
  const txt=await page.getTextContent();
  allText+=' '+txt.items.map(x=>x.str||'').join(' ');
  for(const link of await page.getAnnotations({intent:'display'})){
   if(link.subtype==='Link'){links++;if(link.dest)notes++;}
  }
  page.cleanup();
 }
}finally{await document.destroy();}
assert.ok(links>=73&&notes>=40,'PDF hyperlink fidelity');
const norm=s=>s.replace(/\s+/g,' ').normalize('NFKC').toLowerCase().trim();
const text=norm(allText);
const missing=fields.filter(x=>!text.includes(norm(x.title))).map(x=>x.id);
assert.deepEqual(missing,[],'PDF missed canonical headings');
const pdfinfo=spawnSync('pdfinfo',[pdffile],{encoding:'utf8'});
assert.equal(pdfinfo.status,0,pdfinfo.stderr);
assert.match(pdfinfo.stdout,/^Tagged:\s+yes$/m);
assert.match(pdfinfo.stdout,/^Pages:\s+245$/m);
assert.match(pdfinfo.stdout,/^Page size:\s+420 x 594\.9/m);
const pi=spawnSync('pdfimages',['-list',pdffile],{encoding:'utf8'});
assert.equal(pi.status,0,pi.stderr);
const row=pi.stdout.split(/\r?\n/).filter(x=>/^\s*\d+\s+\d+\s+image\s/.test(x));
const imagePages=[...new Set(row.map(x=>Number(x.trim().split(/\s+/)[0])))].sort((a,b)=>a-b);
assert.equal(imagePages.length,7,'PDF cover + six diagram pages');
const vp=JSON.parse(await readFile(path.join(root,'pdfua-final-raw.json'),'utf8')).report.jobs[0].validationResult[0];
assert.ok(vp.profileName.includes('PDF/UA-1'));
assert.equal(vp.compliant,true);
assert.equal(vp.details.failedRules,0);assert.equal(vp.details.failedChecks,0);
const epubcheck=JSON.parse(await readFile(path.join(root,'epubcheck-candidate.json'),'utf8'));
assert.ok(Array.isArray(epubcheck.messages));
const bad=epubcheck.messages.filter(x=>['ERROR','FATAL','WARNING'].includes(x.severity));
assert.equal(bad.length,0,'official EPUBCheck warnings/errors');
const checkout=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
assert.equal(checkout.status,0,checkout.stderr);
const head=checkout.stdout.trim();
assert.match(head,/^[a-f0-9]{40}$/);
const report={
 schemaVersion:1,kind:'UNPUBLISHED_VERSIONED_PRODUCTION_EXPORT_CANDIDATE',
 workId:'how-to-love-god',version:VERSION,exactSourceHead:head,workflowEventSha:process.env.GITHUB_SHA||null,sourceContentSha256:sourceSha,
 existingActiveRelease:'1.1.0',candidateReleaseStatus:'NO_GO',
 generatedFiles:files,
 executedChecks:{sourceSections:51,epubChapters:titles.size,epubToc:52,epubSpine:52,
 epubFigureCaptions:figureCount,epubImagesMatchingImmutableHashes:7,
 pdfPages:pages,pdfTagged:true,pdfSourceHeadings:51,pdfLinks:links,pdfInternalNotes:notes,
 pdfImagePages:imagePages,veraPDFMachineCompliant:true,veraPDFFailedRules:0,
 veraPDFFailedChecks:0,epubcheckErrorsAndWarnings:0},
 approved:false,registeredAsRelease:false,uploadedToStorage:false,
 limitations:['Output uses QA-derived render engine; public production export adoption pending',
 'Em/Strong roles mapped to Span: assistive semantics require human review',
 'No real device or physical A5 print review',
 'Source author rights and attributions unapproved',
 'Full Account-dependent Library build remains blocked'],
 humanGates:['Author rights','Six detailed figure descriptions','Actual A5 legibility',
 'PDF/EPUB assistive-tech use','Real desktop/mobile reader','Full production build',
 'Explicit versioned edition release authorization']
};
await writeFile(path.join(out,'candidate-evidence.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(root,'book1-versioned-export-candidate.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
