// Offline, nonpublishing final-metadata/release contract tests for Book 1.
// Mock inputs are never authorization. No releases, R2 objects or final book binaries are written.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const WORK_ID = 'how-to-love-god';
const BASE = '519c23b16ab450bf9577aab94114e982e76541b2';
const MEDIA_ROOT = 'https://thiepn.dev/library/media/works/how-to-love-god/editions/';
const sha256 = s => createHash('sha256').update(s).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
const isHash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const unapproved = s => !nonempty(s) || /(?:UNPUBLISHED|\bQA\b|TBD|PENDING|UNAPPROVED|PLACEHOLDER)/i.test(s);
const escapeXml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function approvedIdentity(a) {
  ensure(a && a.decision === 'APPROVED', 'identity approval missing');
  ensure(nonempty(a.authorityName) && nonempty(a.authorityRole) && nonempty(a.evidenceRef), 'identity authority/evidence missing');
  ensure(/^20\d\d-\d\d-\d\d$/.test(a.signedDate), 'signed date missing');
  for (const k of ['publicByline','copyrightHolder','copyrightNotice','coverCredit'])
    ensure(!unapproved(a[k]), `approved identity field missing: ${k}`);
  ensure(a.coverUseGranted === true && a.sixFigureUsesGranted === true, 'image rights not granted');
  ensure(a.publisherReleaseAuthority === true, 'release authority not granted');
  ensure(a.conflictResolved === true, 'Thiepn/Jonathan discrepancy unresolved');
  return {title:'How to Love God',creator:a.publicByline,rights:a.copyrightNotice,language:'en',
    coverCredit:a.coverCredit,holder:a.copyrightHolder,approvalRef:a.evidenceRef};
}
function metadataRepresentations(meta) {
  // Source-of-truth mapping for future renderer integration, not an EPUB or PDF.
  const opf = '<dc:title>'+escapeXml(meta.title)+'</dc:title>'+
    '<dc:creator>'+escapeXml(meta.creator)+'</dc:creator>'+
    '<dc:language>'+escapeXml(meta.language)+'</dc:language>'+
    '<dc:rights>'+escapeXml(meta.rights)+'</dc:rights>';
  const pdf = {Title:meta.title,Author:meta.creator,Subject:'Christian discipleship',
    Rights:meta.rights};
  return {epubOpfFragment:opf,pdfDocumentInfo:pdf,
    pdfXmpFields:{'dc:title':meta.title,'dc:creator':meta.creator,'dc:rights':meta.rights}};
}
function approvedBinary(kind, data, version) {
  ensure(data && typeof data === 'object', `${kind} evidence missing`);
  const mime = {pdf:'application/pdf',epub:'application/epub+zip',cover:'image/webp'}[kind];
  ensure(data.mimeType === mime, `${kind} mime mismatch`);
  ensure(isHash(data.sha256) && Number.isSafeInteger(data.sizeBytes) && data.sizeBytes > 1000,
    `${kind} exact-byte evidence missing`);
  ensure(nonempty(data.filename) && !unapproved(data.filename) && !/[\\/]/.test(data.filename),
    `${kind} unapproved filename`);
  const expectedNew = MEDIA_ROOT+version+'/'+data.filename;
  const oldCover = MEDIA_ROOT+'1.1.0/'+data.filename;
  ensure(data.url === expectedNew || (kind === 'cover' && data.url === oldCover && data.approvedReuseOfImmutable110 === true),
    `${kind} URL does not match canonical versioned artifact path`);
  ensure(data.exactBinaryQualified === true, `${kind} exact bytes not validated`);
  return {url:data.url,filename:data.filename,mimeType:mime,sizeBytes:data.sizeBytes,sha256:data.sha256};
}
function candidateManifest(input) {
  const meta=approvedIdentity(input?.identity);
  const version=input?.version;
  ensure(/^\d+\.\d+\.\d+$/.test(version) && version !== '1.1.0', 'unapproved release version');
  ensure(/^20\d\d-\d\d-\d\d$/.test(input.releasedAt), 'release date missing');
  ensure(isHash(input.sourceHash), 'final source hash missing');
  const gates=['sixDescriptions','a5Print','pdfScreenReader','epubReader','desktopAndroid','accountBuild','productionExport','finalRelease'];
  for(const gate of gates) ensure(input.gates?.[gate] === 'PASS', `${gate} gate not passed`);
  ensure(input.mediaStorageVerified === true && nonempty(input.mediaStorageEvidenceRef), 'remote R2 evidence missing');
  const artifacts={};
  for(const kind of ['pdf','epub','cover']) artifacts[kind]=approvedBinary(kind,input.files?.[kind],version);
  return {metadata:meta,manifest:{schemaVersion:1,workId:WORK_ID,version,edition:1,
    releasedAt:input.releasedAt,sourceHash:input.sourceHash,artifacts},metadataMapping:metadataRepresentations(meta)};
}

const fakeHash=sha256('SYNTHETIC_TEST_NOT_A_REAL_BINARY');
const synthetic=()=>({
  identity:{decision:'APPROVED',authorityName:'SYNTHETIC REVIEWER FOR TEST ONLY',authorityRole:'TEST FIXTURE',
    evidenceRef:'SYNTHETIC-NEVER-PUBLISH',signedDate:'2026-10-31',publicByline:'Synthetic Writer & Co.',
    copyrightHolder:'Synthetic Holder',copyrightNotice:'© Synthetic Holder, TEST ONLY',
    coverCredit:'Synthetic Cover Credit',coverUseGranted:true,sixFigureUsesGranted:true,
    publisherReleaseAuthority:true,conflictResolved:true},
  version:'1.1.1',releasedAt:'2026-10-31',sourceHash:fakeHash,
  gates:Object.fromEntries(['sixDescriptions','a5Print','pdfScreenReader','epubReader','desktopAndroid','accountBuild','productionExport','finalRelease'].map(x=>[x,'PASS'])),
  mediaStorageVerified:true,mediaStorageEvidenceRef:'SYNTHETIC_R2_RECORD',
  files:Object.fromEntries(['pdf','epub','cover'].map(kind=>{
    const filename=`SYNTHETIC_NOT_REAL.${kind==='cover'?'webp':kind}`;
    return [kind,{filename,url:MEDIA_ROOT+'1.1.1/'+filename,
      mimeType:{pdf:'application/pdf',epub:'application/epub+zip',cover:'image/webp'}[kind],
      sizeBytes:123456,sha256:fakeHash,exactBinaryQualified:true}];
  }))
});

async function run() {
  assert.deepEqual(process.argv.slice(2),['--self-test'],'Only isolated self-test is supported');
  const problems=[];let passes=0;
  const positive=synthetic();const result=candidateManifest(positive);
  const xml=result.metadataMapping.epubOpfFragment;
  assert.ok(xml.includes('Synthetic Writer &amp; Co.'));
  assert.equal(result.metadataMapping.pdfDocumentInfo.Author,positive.identity.publicByline);
  assert.equal(result.metadataMapping.pdfXmpFields['dc:creator'],positive.identity.publicByline);
  assert.equal(YAML.parse(YAML.stringify(result.manifest)).artifacts.pdf.sha256,fakeHash);
  passes++;
  const rejects=(label,mutate)=>{const v=synthetic();mutate(v);assert.throws(()=>candidateManifest(v),undefined,label);problems.push(label);passes++;};
  rejects('authority missing',v=>{v.identity.decision='UNAPPROVED'});
  rejects('identity conflict',v=>{v.identity.conflictResolved=false});
  rejects('unknown byline',v=>{v.identity.publicByline='TBD'});
  rejects('no cover rights',v=>{v.identity.coverUseGranted=false});
  rejects('unapproved figure permissions',v=>{v.identity.sixFigureUsesGranted=false});
  rejects('unapproved release',v=>{v.identity.publisherReleaseAuthority=false});
  rejects('no authority evidence',v=>{v.identity.evidenceRef=''});
  rejects('missing screen-reader acceptance',v=>{v.gates.pdfScreenReader='NOT_TESTED'});
  rejects('private Account build blocked',v=>{v.gates.accountBuild='BLOCKED'});
  rejects('unpublished PDF filename',v=>{v.files.pdf.filename='Book_UNPUBLISHED.pdf'});
  rejects('candidate mismatch to R2 path',v=>{v.files.epub.url='https://other.invalid/book.epub'});
  rejects('unverified PDF SHA',v=>{v.files.pdf.sha256='a'.repeat(20)});
  rejects('newly named PDF not verified',v=>{v.files.pdf.exactBinaryQualified=false});
  rejects('unverified R2 object',v=>{v.mediaStorageVerified=false});
  rejects('attempt to re-register active 1.1.0',v=>{v.version='1.1.0'});
  rejects('release with no final approval',v=>{v.gates.finalRelease='NO_GO'});
  rejects('unapproved cover reuse',v=>{v.files.cover.url=MEDIA_ROOT+'1.1.0/'+v.files.cover.filename});
  assert.equal(passes,18);
  // Verify that the current repository itself has no pending release registration.
  const w=YAML.parse(await readFile('src/content/works/how-to-love-god/work.yaml','utf8'));
  const active=YAML.parse(await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8'));
  assert.equal(w.publication.activeRelease,'1.1.0');assert.equal(w.publication.version,'1.1.0');
  assert.equal(w.authorship,'ai-generated');assert.equal(active.version,'1.1.0');
  assert.deepEqual((await readdir('src/publications/releases/how-to-love-god')).sort(),
    ['1.0.0.yaml','1.0.1.yaml','1.1.0.yaml']);
  const git=(...a)=>{const p=spawnSync('git',a,{encoding:'utf8'});assert.equal(p.status,0,p.stderr);return p.stdout.trim();};
  const head=git('rev-parse','HEAD');assert.equal(head,process.env.BOOK1_EXPECTED_HEAD);
  git('merge-base','--is-ancestor',BASE,head);
  const diff=git('diff','--name-only',BASE,head).split('\n').filter(Boolean);
  const allowed=new Set(['scripts/certification/how-to-love-god-final-export-contract.mjs',
    '.github/workflows/book1-final-export-contract.yml',
    'docs/audits/how-to-love-god/2026-10-31-final-export-decision-sheet.md',
    'scripts/certification/how-to-love-god-release-readiness.mjs']);
  assert.ok(diff.length && diff.every(f=>allowed.has(f)),'Unqualified source/release modifications: '+diff);
  for(const name of ['src/content/works/how-to-love-god/work.yaml','src/publications/releases/how-to-love-god/1.1.0.yaml'])
    assert.equal(git('rev-parse',BASE+':'+name),git('rev-parse','HEAD:'+name),'Immutable original changed');
  const output={schemaVersion:1,status:'FINAL_EXPORT_METADATA_CONTRACT_PASS_RELEASE_NO_GO',
    head,inheritedRC1Head:BASE,tests:passes,denialCases:problems,
    realAuthorApproval:'NOT_PROVIDED',realRightsApproval:'NOT_PROVIDED',
    actualFinalPDF:'NOT_GENERATED',actualFinalEPUB:'NOT_GENERATED',
    actualReleaseManifest:'NOT_REGISTERED',actualR2:'NOT_TOUCHED',
    simulationOnly:true,publicMetadata:'NOT_SELECTED',
    contractFields:['dc:title','dc:creator','dc:rights','pdfTitle','pdfAuthor','pdfRights','workId','version','edition','releasedAt','sourceHash','finalMediaHashes','R2Provenance'],
    originalRelease:'1.1.0_PRESERVED',inheritedEvidence:'SEPARATE_RC1_AND_RELEASE_CONTRACT_PASS_NOT_RERUN',
    blockers:['Identity/rights owner approval','Final metadata chosen and exact-byte format recertification',
      'Six long-description signoffs','A5 actual print','PDF/EPUB assistive technology','Account private install','R2 staging authorization','Explicit GO'],
    publication:'NO_GO'};
  const dir=path.join(process.env.RUNNER_TEMP||'/tmp','book1-final-export-contract');
  await mkdir(dir,{recursive:true,mode:0o700});
  await writeFile(path.join(dir,'metadata-contract-result.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output,null,2));
}
await run();
