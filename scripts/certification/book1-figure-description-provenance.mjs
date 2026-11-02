// Narrow source-provenance test for proposed diagram descriptions only.
// Do not interpret PASS as approval of prose accuracy, accessibility or rights.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const proposal=JSON.parse(await readFile('scripts/certification/book1-figure-long-descriptions.proposed.json','utf8'));
assert.equal(proposal.schemaVersion,1);
assert.equal(proposal.workId,'how-to-love-god');
assert.equal(proposal.approval,'PROPOSED_NOT_APPROVED');
assert.equal(proposal.items.length,6);
assert.equal(new Set(proposal.items.map(x=>x.key)).size,6);
const release=await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8');
const results=[];
for(const item of proposal.items){
 assert.match(item.key,/^figure0[1-6]$/);
 assert.match(item.file,/^[a-z0-9-]+\.md$/);
 assert.ok(item.description.length>=250 && item.description.length<=1200,'length '+item.key);
 assert.ok(item.note.length>45,'relationship summary '+item.key);
 assert.ok(!/approved|certified|pdf\/ua compliant/i.test(item.note),'unapproved claim');
 const manifest=new RegExp('^  '+item.key+':\\r?\\n    url: (https:\\/\\/\\S+)\\r?\\n    filename: (\\S+)\\r?\\n    mimeType: image\\/png\\r?\\n    sizeBytes: (\\d+)\\r?\\n    sha256: ([a-f0-9]{64})','m');
 const m=release.match(manifest);
 assert.ok(m,'release manifest original figure '+item.key);
 const src=await readFile(path.join('src/content/works/how-to-love-god/chapters',item.file),'utf8');
 const image='!['+item.caption+']('+m[1]+')';
 const caption='*Figure — '+item.caption+'.*';
 assert.ok(src.includes(image),'source image not found '+item.key);
 assert.ok(src.includes(caption),'source caption not found '+item.key);
 assert.equal(src.split(image).length-1,1,'duplicate source image '+item.key);
 results.push({key:item.key,chapter:item.file,releaseSha256:m[4],descriptionChars:item.description.length,captionMatches:true});
}
console.log(JSON.stringify({verdict:'SIX_SOURCE_GROUNDED_PROPOSALS_STRUCTURALLY_VERIFIED',approval:'NOT_APPROVED',count:results.length,items:results,limitations:['No image-prose semantic equivalence automatically certified','No published files edited','No screen-reader or PDF/UA audit']},null,2));
