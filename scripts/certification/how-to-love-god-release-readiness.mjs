// No publishing, manifests, media writes, private dependencies, or repeated format qualification.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';
const BASE='785872e24eda06cab7e3db405fc3dfb5c01ef351';
const RUN=41223682811;
const ed=process.env.BOOK1_RC_EVIDENCE_DIR;
assert.ok(ed,'The verified RC evidence directory is required');
const j=async n=>JSON.parse(await readFile(path.join(ed,n),'utf8'));
const [rc,ua,ep]=await Promise.all([j('book1-versioned-export-candidate.json'),j('pdfua-final-raw.json'),j('epubcheck-candidate.json')]);
const cmd=(...a)=>{const r=spawnSync('git',a,{encoding:'utf8'});assert.equal(r.status,0,'git command failed: '+r.stderr);return r.stdout.trim();};
const head=cmd('rev-parse','HEAD');
assert.equal(head,process.env.BOOK1_EXPECTED_HEAD);
assert.equal(process.env.BOOK1_EVIDENCE_RUN,String(RUN));
assert.equal(rc.exactSourceHead,BASE);
cmd('merge-base','--is-ancestor',BASE,head);
const changes=cmd('diff','--name-only',BASE,head).split('\n').filter(Boolean);
const allowed=new Set(['scripts/certification/how-to-love-god-release-readiness.mjs','.github/workflows/book1-release-readiness.yml','docs/audits/how-to-love-god/2026-10-31-1.1.1-rc1-approval-kit.md',
 'scripts/certification/how-to-love-god-final-export-contract.mjs',
 '.github/workflows/book1-final-export-contract.yml',
 'docs/audits/how-to-love-god/2026-10-31-final-export-decision-sheet.md']);
assert.ok(changes.length>0&&changes.every(f=>allowed.has(f)),'Source/render/release changed; rerun full qualification: '+changes);
const w=YAML.parse(await readFile('src/content/works/how-to-love-god/work.yaml','utf8'));
const current=YAML.parse(await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8'));
assert.equal(w.id,'how-to-love-god');assert.equal(w.publication.activeRelease,'1.1.0');assert.equal(w.publication.version,'1.1.0');
assert.equal(w.authorship,'ai-generated');assert.equal(w.publication.edition,1);
assert.equal(current.version,'1.1.0');assert.equal(current.workId,w.id);assert.equal(current.edition,1);
assert.deepEqual((await readdir('src/publications/releases/how-to-love-god')).sort(),['1.0.0.yaml','1.0.1.yaml','1.1.0.yaml']);
const dir='src/content/works/how-to-love-god/chapters';
const fs=(await readdir(dir)).filter(f=>f.endsWith('.md')).sort();
assert.equal(fs.length,51);
const ss=await Promise.all(fs.map(f=>readFile(path.join(dir,f),'utf8')));
const digest=createHash('sha256').update(Buffer.from(fs.map((f,i)=>f+'\0'+ss[i].length+'\0'+ss[i]+'\n').join(''))).digest('hex');
assert.equal(digest,rc.sourceContentSha256,'Cannot reuse evidence if manuscript changed');
assert.equal(rc.workId,w.id);assert.equal(rc.version,'1.1.1-rc.1');
assert.equal(rc.candidateReleaseStatus,'NO_GO');
assert.equal(rc.approved,false);assert.equal(rc.registeredAsRelease,false);
assert.equal(rc.uploadedToStorage,false);assert.equal(rc.existingActiveRelease,'1.1.0');
assert.equal(rc.executedChecks.sourceSections,51);
assert.equal(rc.executedChecks.epubImagesMatchingImmutableHashes,7);
assert.equal(rc.executedChecks.pdfPages,245);
assert.equal(rc.executedChecks.pdfLinks,73);
assert.equal(rc.executedChecks.pdfInternalNotes,40);
const v=ua.report.jobs[0].validationResult[0];
assert.ok(v.profileName.includes('PDF/UA-1'));
assert.equal(v.compliant,true);assert.equal(v.details.failedRules,0);assert.equal(v.details.failedChecks,0);
assert.equal(ep.messages.filter(m=>['FATAL','ERROR','WARNING'].includes(m.severity)).length,0);
for(const type of ['pdf','epub']){
 const item=rc.generatedFiles[type];
 assert.ok(item.filename.includes('UNPUBLISHED')&&item.filename.includes('1.1.1-rc.1'));
 assert.match(item.sha256,/^[a-f0-9]{64}$/);assert.ok(item.bytes>100000);
}
const currentBlob=cmd('rev-parse','HEAD:src/publications/releases/how-to-love-god/1.1.0.yaml');
assert.equal(cmd('rev-parse',BASE+':src/publications/releases/how-to-love-god/1.1.0.yaml'),currentBlob);
assert.equal(cmd('rev-parse',BASE+':src/content/works/how-to-love-god/work.yaml'),cmd('rev-parse','HEAD:src/content/works/how-to-love-god/work.yaml'));
const lib=await readFile('src/lib/content/releases.ts','utf8');
const stage=await readFile('scripts/stage-publication-media.mjs','utf8');
const repo=await readFile('src/lib/content/repository.ts','utf8');
assert.ok(lib.includes('getActiveRelease')&&lib.includes('releasesRoot')&&lib.includes('mediaOrigin'));
assert.ok(stage.includes("wrangler', 'r2', 'object', 'get'")&&stage.includes('SHA-256 mismatch'));
assert.ok(repo.includes('getAiWorks')&&repo.includes('isAiGeneratedWork'));
const kit=await readFile('docs/audits/how-to-love-god/2026-10-31-1.1.1-rc1-approval-kit.md','utf8');
assert.ok(kit.includes('## Individual sign-off record')&&kit.includes('## Exact human evaluation instructions'));
assert.match(current.artifacts.cover.sha256,/^[a-f0-9]{64}$/);
const report={
 schemaVersion:1,kind:'BOOK1_READONLY_RELEASE_CONTRACT',status:'TECHNICAL_CANDIDATE_EVIDENCE_REUSED_RELEASE_NO_GO',
 head,reusedEvidence:{run:RUN,sourceHead:BASE,sourceContentSha256:digest,diff:changes,
  veraPDFProfile:v.profileName,veraPDFFailedChecks:0,epubcheckWarningsErrors:0,
  candidatePdf:rc.generatedFiles.pdf,candidateEpub:rc.generatedFiles.epub},
 existing:{activeRelease:'1.1.0',releaseBlobSha:currentBlob,immutable:true,workId:w.id,
  catalog:'AI section, not non-AI main Library',edition:1},
 futureManifest:{registered:false,readyToStage:false,version:'REQUIRES_APPROVAL',releasedAt:'REQUIRES_APPROVAL',
  required:['schemaVersion','workId','version','edition','releasedAt','sourceHash','artifacts.pdf','artifacts.epub','artifacts.cover'],
  candidateBinaryMetadata:'UNPUBLISHED_NOT_APPROVED_FOR_RELEASE',
  approvedCover:'PENDING_RIGHTS',knownOriginalCoverChecksum:current.artifacts.cover.sha256,
  canonicalMediaOrigin:'https://thiepn.dev/library/media/',
  pipeline:'approved exact bytes in remote R2 -> stage:media hash verification -> versioned release YAML and activeRelease update -> approved build/deploy -> live verification'},
 holds:{sourceAuthorAndRights:'UNAPPROVED',sixFigures:'UNAPPROVED',printedA5:'NOT_TESTED',
  pdfEpubScreenReader:'NOT_TESTED',desktopAndroid:'NOT_TESTED',
  productionFormatterAdoption:'NOT_APPROVED',privateAccountBuild:'BLOCKED_404',release:'NO_GO'},
 noWorkPerformed:['No public binary rendered','No R2 upload','No release manifest created','No deployment','No merge']
};
const out=path.join(process.env.RUNNER_TEMP||'/tmp','book1-release-contract');
await mkdir(out,{recursive:true,mode:0o700});
await writeFile(path.join(out,'book1-release-readiness.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({verdict:report.status,head,sourceSha256:digest,
  reusedRun:RUN,validator:'PDFUA1_0_FAILURES',epubcheck:'0_ERRORS_WARNINGS',
  oldReleaseUnchanged:true,registeredManifest:false,release:'NO_GO'},null,2));
