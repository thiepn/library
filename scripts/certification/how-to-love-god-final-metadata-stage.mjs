// Isolated, approval-gated metadata staging for actual Book 1 renderer outputs.
// No publishing, no source edits, no R2, no release manifest, no final book files.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import JSZip from 'jszip';
import YAML from 'yaml';
const sha=s=>createHash('sha256').update(s).digest('hex');
const ROOT=path.join(process.env.RUNNER_TEMP||'/tmp','book1-format-qa');
const BOOK='how-to-love-god';
const FIGS=Array.from({length:6},(_,i)=>'figure'+String(i+1).padStart(2,'0'));
const unsafe=s=>typeof s!=='string'||!s.trim()||/(UNPUBLISHED|PENDING|SYNTHETIC|UNAPPROVED|PLACEHOLDER|TBD)/i.test(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function validate(record,work,copyright,proposed){
 assert.equal(record?.schemaVersion,1);
 assert.equal(record?.workId,BOOK);
 assert.equal(record?.decision,'APPROVED_FOR_PRIVATE_REHEARSAL');
 assert.equal(record?.nonpublishingOnly,true);
 const a=record.identity;
 assert.equal(a?.decision,'APPROVED');
 assert.equal(a?.conflictResolved,true);
 assert.ok(a?.authorityRole&&a?.authorityName&&a?.evidenceRef&&/^20\d{2}-\d\d-\d\d$/.test(a?.signedDate??''),'Named, dated authority required');
 for(const field of ['publicByline','copyrightHolder','copyrightNotice','coverCredit'])
   assert.ok(!unsafe(a?.[field]),'Missing approved '+field);
 assert.equal(a?.coverUseGranted,true);
 assert.equal(a?.sixFigureUsesGranted,true);
 // The original cover and six figures require their own explicitly approved reuse.
 assert.equal(record?.cover?.reuseOfOriginal110,'APPROVED');
 assert.ok(!unsafe(record?.cover?.evidenceRef));
 const map=new Map(proposed.items.map(x=>[x.key,x]));
 assert.equal(map.size,6);
 assert.equal(record?.figures?.length,6);
 const decisions=new Set();
 for(const item of record.figures){
   assert.ok(FIGS.includes(item.key)&&!decisions.has(item.key),'Invalid/missing figure decision');
   decisions.add(item.key);
   assert.equal(item.decision,'APPROVED');
   assert.ok(!unsafe(item.evidenceRef));
   assert.equal(item.descriptionSha256,sha(map.get(item.key).description));
 }
 assert.equal(decisions.size,6);
 assert.equal(work.id,BOOK);
 assert.equal(work.authorship,'ai-generated');
 assert.equal(work.publication.activeRelease,'1.1.0');
 assert.equal(work.contributors.find(x=>x.role==='author')?.name,a.publicByline,
   'STOP: Library catalog byline disagrees with approved final name');
 assert.equal(work.rights.notice,a.copyrightNotice,
   'STOP: Library rights notice disagrees with approved final rights');
 assert.ok(copyright.includes('**'+a.publicByline+'**'),
   'STOP: printed copyright page byline differs from approved name');
 assert.ok(copyright.includes(a.copyrightNotice),
   'STOP: printed copyright notice differs from approved rights');
 assert.ok(work.cover.alt.includes(a.publicByline),
   'STOP: cover alt/credit differs from approved name');
 return {schemaVersion:1,mode:'NONPUBLISHING_REHEARSAL_ONLY',workId:BOOK,
  title:work.title,creator:a.publicByline,rights:a.copyrightNotice,language:'en',
  coverCredit:a.coverCredit,approvalEvidenceRef:a.evidenceRef,
  publication:'NO_GO'};
}
function substituteOpf(opf,metadata) {
 let count=0;
 const replace=(tag,val)=>{
   const pattern=new RegExp('<dc:'+tag+'(?:\\s+[^>]*)?>[\\s\\S]*?<\\/dc:'+tag+'>','g');
   const matches=[...opf.matchAll(pattern)];
   assert.equal(matches.length,1,'Expected exactly one '+tag);
   count++;
   return out.replace(pattern,'<dc:'+tag+'>'+esc(val)+'</dc:'+tag+'>');
 };
 let out=opf;
 out=replace.call(null,'title',metadata.title);
 out=replace.call(null,'creator',metadata.creator);
 const lang=/<dc:language>[^<]+<\/dc:language>/g;
 assert.equal([...out.matchAll(lang)].length,1);
 out=out.replace(lang,'<dc:language>'+esc(metadata.language)+'</dc:language>');
 assert.ok(!/<dc:rights(?:\s+[^>]*)?>/.test(out),'Existing rights entry must be reviewed, not silently replaced');
 const end='</metadata>';
 assert.equal(out.split(end).length,2,'EPUB OPF metadata closing element must be unique');
 out=out.replace(end,'<dc:rights>'+esc(metadata.rights)+'</dc:rights>'+end);
 assert.equal(count,2);
 return out;
}
async function rewriteEpub(src,dest,meta){
 const zip=await JSZip.loadAsync(await readFile(src),{checkCRC32:true});
 const before=Object.keys(zip.files).sort();
 const file=zip.file('OEBPS/content.opf');assert.ok(file,'Real source EPUB OPF missing');
 const original=await file.async('string');
 const rewritten=substituteOpf(original,meta);
 zip.file('OEBPS/content.opf',rewritten);
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 const verify=await JSZip.loadAsync(bytes,{checkCRC32:true});
 assert.deepEqual(Object.keys(verify.files).sort(),before);
 assert.equal(await verify.file('OEBPS/content.opf').async('string'),rewritten);
 for(const name of before){
   if(name==='OEBPS/content.opf'||name.endsWith('/'))continue;
   const x=await zip.file(name).async('nodebuffer'),y=await verify.file(name).async('nodebuffer');
   assert.equal(sha(x),sha(y),'Unrelated EPUB member changed '+name);
 }
 await writeFile(dest,bytes,{mode:0o600,flag:'wx'});
 return {bytes:bytes.length,sha256:sha(bytes),sourceSha256:sha(await readFile(src)),members:before.length};
}
async function selfTest(){
 const metadata={title:'How to Love God',creator:'Example & Test <Writer>',rights:'© Example & Test',language:'en'};
 const opf='<package><metadata><dc:title>Unpublished</dc:title><dc:creator>QA</dc:creator><dc:language>en</dc:language></metadata><manifest/></package>';
 const actual=substituteOpf(opf,metadata);
 assert.ok(actual.includes('Example &amp; Test &lt;Writer&gt;'));
 assert.ok(actual.includes('<dc:title>How to Love God</dc:title>'), 'Do not discard title while patching creator');
 assert.ok(actual.includes('<dc:rights>© Example &amp; Test</dc:rights>'));
 assert.throws(()=>substituteOpf(actual,metadata),/Existing rights entry/);
 const work=YAML.parse(await readFile('src/content/works/how-to-love-god/work.yaml','utf8'));
 const source=await readFile('src/content/works/how-to-love-god/chapters/00-copyright.md','utf8');
 const proposals=JSON.parse(await readFile('scripts/certification/book1-figure-long-descriptions.proposed.json','utf8'));
 assert.equal(proposals.approval,'PROPOSED_NOT_APPROVED');
 const fake=(name)=>{
   const notice='Copyright © 2026 '+name+'. All rights reserved.';
   return {schemaVersion:1,workId:BOOK,decision:'APPROVED_FOR_PRIVATE_REHEARSAL',nonpublishingOnly:true,
    identity:{decision:'APPROVED',conflictResolved:true,authorityRole:'TEST',authorityName:'TEST',
      evidenceRef:'TEST-ONLY',signedDate:'2026-10-31',publicByline:name,copyrightHolder:name,
      copyrightNotice:notice,coverCredit:name,coverUseGranted:true,sixFigureUsesGranted:true},
    cover:{reuseOfOriginal110:'APPROVED',evidenceRef:'TEST-ONLY'},
    figures:proposals.items.map(x=>({key:x.key,decision:'APPROVED',evidenceRef:'TEST-ONLY',descriptionSha256:sha(x.description)}))};
 };
 assert.throws(()=>validate(fake('Jonathan'),work,source,proposals),/catalog byline/);
 assert.throws(()=>validate(fake('Thiepn'),work,source,proposals),/printed copyright/);
 const z=new JSZip();z.file('mimetype','application/epub+zip',{compression:'STORE'});
 z.file('OEBPS/content.opf',opf);z.file('OEBPS/text/one.xhtml','<h1>Original chapter</h1>');
 const temp=path.join(process.env.RUNNER_TEMP||'/tmp','book1-metadata-unit');
 await mkdir(temp,{recursive:true,mode:0o700});
 const inp=path.join(temp,'fixture.epub'),out=path.join(temp,'rehearsal.epub');
 await writeFile(inp,await z.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 const result=await rewriteEpub(inp,out,metadata);
 assert.equal(result.members,5, 'JSZip also writes OEBPS and OEBPS/text directory entries');
 const renderer=await readFile('scripts/certification/how-to-love-god-print-epub.mjs','utf8');
 assert.ok(renderer.includes("how-to-love-god-UNPUBLISHED-QA.epub")
   && renderer.includes("how-to-love-god-UNPUBLISHED-QA.pdf"),
   'Actual renderer source paths must be verified');
 const report={status:'METADATA_STAGE_UNIT_PASS_RELEASE_NO_GO',tests:8,
   exercised:'Real OPF patching of synthetic EPUB plus fail-closed checks against actual source discrepancy',
   exporter:'Actual QA renderer output paths statically qualified; full book NOT rendered in unit check',
   pdfWriter:'Independent Python synthetic PDF test is required',
   realApproval:'NOT_PROVIDED',finalEPUB:'NOT_GENERATED',release:'NO_GO'};
 await writeFile(path.join(temp,'metadata-stage-unit.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
async function prepare(){
 assert.equal(process.env.BOOK1_FINAL_METADATA_REHEARSAL,'1','Nonpublishing rehearsal switch required');
 const name=process.env.BOOK1_FINAL_APPROVAL_RECORD;
 assert.ok(name&&path.isAbsolute(name),'External signed approval record path required');
 const resolved=await realpath(name);
 const tempRoot=await realpath(process.env.RUNNER_TEMP||'/tmp');
 assert.ok(resolved.startsWith(tempRoot+path.sep),'Approval record must be outside git, under trusted temporary directory');
 const record=JSON.parse(await readFile(resolved,'utf8'));
 const work=YAML.parse(await readFile('src/content/works/how-to-love-god/work.yaml','utf8'));
 const copy=await readFile('src/content/works/how-to-love-god/chapters/00-copyright.md','utf8');
 const proposed=JSON.parse(await readFile('scripts/certification/book1-figure-long-descriptions.proposed.json','utf8'));
 const normalized=validate(record,work,copy,proposed);
 const source=path.join(ROOT,'how-to-love-god-UNPUBLISHED-QA.epub');
 const target=path.join(ROOT,'how-to-love-god-FINAL-METADATA-REHEARSAL-QA.epub');
 const epub=await rewriteEpub(source,target,normalized);
 const metaFile=path.join(ROOT,'how-to-love-god-FINAL-METADATA-REHEARSAL.json');
 await writeFile(metaFile,JSON.stringify(normalized,null,2)+'\n',{flag:'wx',mode:0o600});
 // The PDF step uses EXACTLY the same normalized metadata, never its own author guess.
 const py=spawnSync(process.env.BOOK1_PYTHON||'python3',[
   'scripts/certification/how-to-love-god-final-pdf-metadata.py','--prepare',
   path.join(ROOT,'how-to-love-god-PDFUA-FINAL-QA.pdf'),
   path.join(ROOT,'how-to-love-god-FINAL-METADATA-REHEARSAL-QA.pdf'),
   metaFile],{encoding:'utf8'});
 assert.equal(py.status,0,'PDF metadata patch failed: '+py.stderr);
 const report={status:'NONPUBLISHING_METADATA_REHEARSAL_ONLY',approvalRef:normalized.approvalEvidenceRef,
   epub, pdf:py.stdout.trim(),veraPDF:'REQUIRED_FOR_REHEARSAL_FINAL_BYTES',
   epubcheck:'REQUIRED_FOR_REHEARSAL_FINAL_BYTES',
   humanAT:'NOT_PERFORMED',sourceAuthority:'MUST_BE_REVIEWED',release:'NO_GO'};
 await writeFile(path.join(ROOT,'how-to-love-god-FINAL-METADATA-REHEARSAL-evidence.json'),
   JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(report));
}
assert.equal(process.argv.length,3,'Choose --self-test or --prepare');
if(process.argv[2]==='--self-test')await selfTest();
else if(process.argv[2]==='--prepare')await prepare();
else throw Error('Only --self-test and --prepare supported');
