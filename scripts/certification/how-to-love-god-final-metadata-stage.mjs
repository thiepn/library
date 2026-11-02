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
const HASH=/^[0-9a-f]{64}$/;
const MEDIA_KEYS=['cover',...Array.from({length:6},(_,i)=>'figure0'+(i+1))];
// Bind an approval to the EXACT source and original media identities; a bare
// "approved" flag must not authorize different manuscript or image bytes.
function checkApprovedSnapshot(record, sourceDigest, originalRelease, verifiedMedia){
 assert.ok(HASH.test(record?.sourceContentSha256||''),'Signed source digest missing');
 assert.equal(record.sourceContentSha256,sourceDigest,'Approval applies to a different manuscript');
 assert.equal(originalRelease?.workId,BOOK);
 assert.equal(originalRelease?.version,'1.1.0');
 assert.ok(Array.isArray(verifiedMedia)&&verifiedMedia.length===7,'Exactly seven verified media objects required');
 const seen=new Set();
 for(const item of verifiedMedia){
   assert.ok(MEDIA_KEYS.includes(item?.key)&&!seen.has(item.key),'Unexpected or duplicate source media key');
   seen.add(item.key);
   const original=originalRelease.artifacts[item.key];
   assert.equal(item.verified,true,'Original media not verified: '+item.key);
   assert.equal(item.sha256,original.sha256,'Media hash differs from released source: '+item.key);
   assert.equal(item.size,original.sizeBytes,'Media size differs from released source: '+item.key);
   assert.equal(item.url,original.url,'Media URL differs from released source: '+item.key);
   assert.equal(item.name,original.filename,'Media filename differs: '+item.key);
   assert.equal(item.mime,original.mimeType,'Media MIME differs: '+item.key);
   const permitted=item.key==='cover'?record?.cover:record?.figures?.find(x=>x.key===item.key);
   assert.equal(permitted?.original110Sha256,original.sha256,
     'Approval is not bound to immutable original '+item.key);
 }
 assert.equal(seen.size,7);
 return true;
}
async function currentManuscriptDigest(){
 const dir='src/content/works/how-to-love-god/chapters';
 const files=(await readdir(dir)).filter(x=>x.endsWith('.md')).sort();
 assert.equal(files.length,51);
 const sources=await Promise.all(files.map(x=>readFile(path.join(dir,x),'utf8')));
 return sha(files.map((f,i)=>f+'\0'+sources[i].length+'\0'+sources[i]+'\n').join(''));
}
async function actualMediaDigest(verifiedMedia){
 for(const item of verifiedMedia){
   const b=await readFile(path.join(ROOT,'media',item.name));
   assert.equal(b.length,item.size,'Actual source media bytes differ: '+item.key);
   assert.equal(sha(b),item.sha256,'Actual source media checksum differs: '+item.key);
 }
}
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
// A separately verified media folder is insufficient: reject a media-omitting
// or incomplete EPUB proof even if the approval record quotes that EPUB hash.
async function requireCompleteMediaEpub(src,verifiedMedia){
 const bytes=await readFile(src);
 assert.ok(bytes.length>38&&bytes.readUInt32LE(0)===0x04034b50
   &&bytes.readUInt16LE(8)===0
   &&bytes.subarray(30,38).toString()==='mimetype',
   'EPUB mimetype must be the first, uncompressed ZIP member');
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
 assert.equal(await zip.file('mimetype')?.async('string'),'application/epub+zip');
 const members=Object.keys(zip.files).filter(name=>!name.endsWith('/'));
 assert.equal(members.length,63,'Complete source EPUB must have 63 files, including all seven media');
 const chapters=members.filter(name=>/^OEBPS\/text\/[^/]+\.xhtml$/.test(name));
 assert.equal(chapters.length,51,'Input EPUB must include all 51 chapter sections');
 assert.ok(zip.file('OEBPS/cover.xhtml'),'Input EPUB has no cover page');
 const images=members.filter(name=>name.startsWith('OEBPS/images/'));
 assert.equal(images.length,7,'Input EPUB must include exactly seven source images');
 const opf=await zip.file('OEBPS/content.opf')?.async('string');
 assert.ok(opf&&opf.includes('properties="cover-image"'),'Input EPUB has no OPF cover-image entry');
 for(const item of verifiedMedia){
   const member='OEBPS/images/'+item.name;
   const image=zip.file(member);
   assert.ok(image,'Original image is missing inside input EPUB: '+item.key);
   const actual=await image.async('nodebuffer');
   assert.equal(actual.length,item.size,'Embedded image size differs: '+item.key);
   assert.equal(sha(actual),item.sha256,'Embedded image checksum differs: '+item.key);
   assert.ok(opf.includes('href="images/'+item.name+'"'),
     'Embedded image missing from OPF manifest: '+item.key);
 }
 return true;
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
 const release=YAML.parse(await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8'));
 const sampleMedia=MEDIA_KEYS.map(key=>{const o=release.artifacts[key];return {
   key,verified:true,sha256:o.sha256,size:o.sizeBytes,url:o.url,name:o.filename,mime:o.mimeType};});
 const digest=await currentManuscriptDigest();
 const approved=fake('Thiepn');
 approved.sourceContentSha256=digest;
 approved.cover.original110Sha256=release.artifacts.cover.sha256;
 for(const fig of approved.figures)fig.original110Sha256=release.artifacts[fig.key].sha256;
 assert.equal(checkApprovedSnapshot(approved,digest,release,sampleMedia),true);
 const wrongSource=structuredClone(approved);wrongSource.sourceContentSha256='a'.repeat(64);
 assert.throws(()=>checkApprovedSnapshot(wrongSource,digest,release,sampleMedia),/different manuscript/);
 const wrongCover=structuredClone(approved);wrongCover.cover.original110Sha256='b'.repeat(64);
 assert.throws(()=>checkApprovedSnapshot(wrongCover,digest,release,sampleMedia),/immutable original cover/);
 const wrongFigure=structuredClone(approved);wrongFigure.figures[2].original110Sha256='c'.repeat(64);
 assert.throws(()=>checkApprovedSnapshot(wrongFigure,digest,release,sampleMedia),/immutable original figure03/);
 const tamperedMedia=structuredClone(sampleMedia);tamperedMedia[1].sha256='d'.repeat(64);
 assert.throws(()=>checkApprovedSnapshot(approved,digest,release,tamperedMedia),/Media hash differs/);
 const z=new JSZip();z.file('mimetype','application/epub+zip',{compression:'STORE'});
 z.file('OEBPS/content.opf',opf);z.file('OEBPS/text/one.xhtml','<h1>Original chapter</h1>');
 const temp=path.join(process.env.RUNNER_TEMP||'/tmp','book1-metadata-unit');
 await mkdir(temp,{recursive:true,mode:0o700});
 const inp=path.join(temp,'fixture.epub'),out=path.join(temp,'rehearsal.epub');
 await writeFile(inp,await z.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 await assert.rejects(()=>requireCompleteMediaEpub(inp,sampleMedia),/63 files/,
   'Do not accept a metadata-writable but cover/figure-incomplete EPUB');
 const result=await rewriteEpub(inp,out,metadata);
 assert.equal(result.members,5, 'JSZip also writes OEBPS and OEBPS/text directory entries');
 const renderer=await readFile('scripts/certification/how-to-love-god-print-epub.mjs','utf8');
 assert.ok(renderer.includes("how-to-love-god-UNPUBLISHED-QA.epub")
   && renderer.includes("how-to-love-god-UNPUBLISHED-QA.pdf"),
   'Actual renderer source paths must be verified');
 const report={status:'METADATA_STAGE_UNIT_PASS_RELEASE_NO_GO',tests:12,
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
 const release=YAML.parse(await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8'));
 const verifiedMedia=JSON.parse(await readFile(path.join(ROOT,'media-verification.json'),'utf8'));
 const sourceDigest=await currentManuscriptDigest();
 checkApprovedSnapshot(record,sourceDigest,release,verifiedMedia);
 await actualMediaDigest(verifiedMedia);
 const source=path.join(ROOT,'how-to-love-god-UNPUBLISHED-QA.epub');
 const target=path.join(ROOT,'how-to-love-god-FINAL-METADATA-REHEARSAL-QA.epub');
 const originalPdf=path.join(ROOT,'how-to-love-god-PDFUA-FINAL-QA.pdf');
 await requireCompleteMediaEpub(source,verifiedMedia);
 const actualInputEpubSha256=sha(await readFile(source));
 const actualInputPdfSha256=sha(await readFile(originalPdf));
 assert.ok(HASH.test(record?.inputProofSha256?.epub||'')&&HASH.test(record?.inputProofSha256?.pdf||''),
   'Exact QA proof input identities are required');
 assert.equal(record.inputProofSha256.epub,actualInputEpubSha256,'Approval is for another EPUB proof');
 assert.equal(record.inputProofSha256.pdf,actualInputPdfSha256,'Approval is for another PDF proof');
 normalized.sourceContentSha256=sourceDigest;
 normalized.inputProofSha256={epub:actualInputEpubSha256,pdf:actualInputPdfSha256};
 normalized.originalMediaSha256=Object.fromEntries(verifiedMedia.map(m=>[m.key,m.sha256]));
 const epub=await rewriteEpub(source,target,normalized);
 const metaFile=path.join(ROOT,'how-to-love-god-FINAL-METADATA-REHEARSAL.json');
 await writeFile(metaFile,JSON.stringify(normalized,null,2)+'\n',{flag:'wx',mode:0o600});
 // The PDF step uses EXACTLY the same normalized metadata, never its own author guess.
 const py=spawnSync(process.env.BOOK1_PYTHON||'python3',[
   'scripts/certification/how-to-love-god-final-pdf-metadata.py','--prepare',
   originalPdf,
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
