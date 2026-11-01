// Build isolated media for a NONPUBLISHING 1.1.1 candidate from the six accepted Phase C SVGs.
// SVG files are immutable in this commit and expand to editable vector source.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.join(process.env.RUNNER_TEMP||'/tmp','book1-format-qa');
const sourceRoot='src/publications/candidates/how-to-love-god/1.1.1/figures';
const sha=b=>createHash('sha256').update(b).digest('hex');
const expected=[
 '9ffe0d789bd2f44e281f2ae320864770b5f3956f0cd657c6481f4a54a9eb3f19',
 '091ba4c034de846618f4cb57741b7831d3850c9281dbfe401e27c2137e866779',
 '9fa64fda88596779098ed9cd3792e8cc680ec741b3db90bb14c92dc42075d879',
 '64f80fe32a6ab8bd8a1d3500dee22d569c9abbde21d04a3217d42eb21f34b81d',
 'f1d42799ea0a616d27b7f5ad794b5c237d46b211350ed4b908ef7f3460f0605e',
 '0f1bd222f0aa8d2bf9010a2ee175704b110ae16cdc2c799c15048ba3aa11e341'
];
const currentWork=await readFile('src/content/works/how-to-love-god/work.yaml','utf8');
assert.match(currentWork,/^  activeRelease: 1\.1\.0$/m);
const oldRelease=await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8');
assert.match(oldRelease,/^version: 1\.1\.0$/m);
const original=JSON.parse(await readFile(path.join(root,'media-verification.json'),'utf8'));
assert.equal(original.length,7);assert.ok(original.every(x=>x.verified));
await writeFile(path.join(root,'media-verification-original-110.json'),JSON.stringify(original,null,2));
const result=original.map(x=>({...x}));
// The existing catalog cover visibly says THIEPN. The immutable 1.1.0 media
// cover says JONATHAN and must NEVER be reused in the new byline edition.
const coverSource='public/covers/how-to-love-god-v2.webp';
const coverName='How_to_Love_God_Thiepn.webp';
const coverBytes=await readFile(coverSource);
const coverGitHash=(await import('node:child_process')).spawnSync('git',['hash-object',coverSource],{encoding:'utf8'});
assert.equal(coverGitHash.status,0,'Existing catalog cover unavailable');
assert.equal(coverGitHash.stdout.trim(),'508b913d7356e5284087b7b71cdefa7d61422892','Catalog cover source changed unexpectedly');
assert.ok(coverBytes.length>8000,'Cover bytes unexpectedly small');
await mkdir(path.join(root,'media'),{recursive:true});
await writeFile(path.join(root,'media',coverName),coverBytes);
const coverIndex=result.findIndex(x=>x.key==='cover');
assert.ok(coverIndex>=0);
result[coverIndex]={...result[coverIndex],name:coverName,mime:'image/webp',size:coverBytes.length,sha256:sha(coverBytes),origin:'existing-Thiepn-catalog-cover-192x288; print-resolution-review-pending'};

const figures=[];
await mkdir(path.join(root,'media'),{recursive:true});
for(let i=1;i<=6;i++){
 const key='figure0'+i, filename='F0'+i+'_phasec.svg';
 const b=gunzipSync(await readFile(path.join(sourceRoot,filename+'.gz')));
 assert.equal(sha(b),expected[i-1],'approved prototype mismatch '+key);
 const xml=b.toString('utf8');
 assert.match(xml,/<svg\b/);assert.match(xml,/viewBox="0 0 116(?:\.0)? 98(?:\.0)?"/);
 if(i===5){assert.ok(xml.includes('Seek urgent, safeguarding, or professional help as appropriate.'));}
 await writeFile(path.join(root,'media',filename),b);
 const j=result.findIndex(x=>x.key===key);assert.ok(j>=0);
 result[j]={...result[j],name:filename,mime:'image/svg+xml',size:b.length,sha256:sha(b),origin:'accepted-on-screen-Phase-C; not final'};
 figures.push({key,file:filename,sha256:sha(b),bytes:b.length});
}
const description=JSON.parse(await readFile('src/publications/candidates/how-to-love-god/1.1.1/long-descriptions.proposed.json','utf8'));
assert.equal(description.items.length,6);
assert.equal(description.approval,'PROPOSED_NOT_APPROVED');
await writeFile(path.join(root,'media-verification.json'),JSON.stringify(result,null,2));
await writeFile(path.join(root,'new-version-staging.json'),JSON.stringify({candidateVersion:'1.1.1',status:'UNPUBLISHED_NO_GO',originalRelease:'1.1.0',figures,descriptionApproval:false,finalArtApproval:false},null,2));
console.log('BOOK1_NEW_EDITION_SVG_6_OF_6_SHA256_PASS');
