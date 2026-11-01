// Inspect EPUB image semantics and PDF tagged figures on *seven* image-bearing
// pages of an unpublished proof. No full-PDF pagination or regression reruns.
// The seven original media binaries were SHA-verified by the prerequisite step.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {DOMParser} from '@xmldom/xmldom';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const dir=path.join(process.env.RUNNER_TEMP||'/tmp','book1-format-qa');
const proofPdf=path.join(dir,'how-to-love-god-UNPUBLISHED-QA.pdf');
const proofEpub=path.join(dir,'how-to-love-god-UNPUBLISHED-QA.epub');
const media=JSON.parse(await readFile(path.join(dir,'media-verification.json'),'utf8'));
assert.equal(media.length,7);assert.ok(media.every(x=>x.verified));
const zip=await JSZip.loadAsync(await readFile(proofEpub),{checkCRC32:true});
const parser=new DOMParser({onError:(level,message)=>{throw Error('EPUB XML '+level+': '+message);}});
const xhtml=Object.keys(zip.files).filter(x=>x.endsWith('.xhtml')).sort();
const imgs=[];
for(const name of xhtml){
 const doc=parser.parseFromString(await zip.file(name).async('string'),'application/xhtml+xml');
 const html=doc.getElementsByTagName('html').item(0);
 assert.ok(html?.getAttribute('xml:lang')?.trim(),'document language: '+name);
 const main=doc.getElementsByTagName('main');
 if(name.includes('/text/'))assert.equal(main.length,1,'semantic main: '+name);
 for(const image of Array.from(doc.getElementsByTagName('img'))){
  const p=image.parentNode;
  const next=p?.nextSibling;
  let sib=next;while(sib && sib.nodeType!==1)sib=sib.nextSibling;
  const alt=image.getAttribute('alt')||'';
  const fn=name.split('/').pop();
  imgs.push({
   file:fn,src:image.getAttribute('src'),alt,
   htmlParent:p?.localName||p?.nodeName,
   figureCaption:(()=>{let el=image.parentNode;while(el?.nodeType===1){if(el.localName==='figure')return el.getElementsByTagName('figcaption').item(0)?.textContent?.trim()||null;el=el.parentNode;}return null;})(),
   containedInFigure:Boolean((()=>{
     let node=image.parentNode;
     while(node&&node.nodeType===1){if(node.localName==='figure')return true;node=node.parentNode;}return false;
   })()),
   nextElementTag:sib?.localName,
   nextElementText:(sib?.textContent||'').trim().slice(0,170),
   explicitCaptionId: image.getAttribute('aria-describedby')||null
  });
 }
}
assert.equal(imgs.length,7,'exactly cover plus six embedded diagrams');
assert.ok(imgs.every(x=>x.alt.trim()),'all image alternatives present');
const pkg=parser.parseFromString(await zip.file('OEBPS/content.opf').async('string'),'application/xml');
const a11yMeta=Array.from(pkg.getElementsByTagName('meta')).filter(x=>String(x.getAttribute('property')).includes('access')).map(x=>({property:x.getAttribute('property'),text:x.textContent?.trim()}));
const cover=imgs.find(x=>x.file==='cover.xhtml');
const figures=imgs.filter(x=>x.file!=='cover.xhtml');
assert.ok(cover,'cover semantic image missing');
assert.equal(figures.length,6);
const nav=parser.parseFromString(await zip.file('OEBPS/nav.xhtml').async('string'),'application/xhtml+xml');
const navTypes=Array.from(nav.getElementsByTagName('nav')).map(x=>x.getAttribute('epub:type')).filter(Boolean);
assert.ok(navTypes.includes('toc'),'EPUB TOC landmark absent');
// PDF page selection from actual image XObjects: no second 245-page PDF scan.
const pdfImages=spawnSync('pdfimages',['-list',proofPdf],{encoding:'utf8'});
assert.equal(pdfImages.status,0,pdfImages.stderr);
const rows=pdfImages.stdout.split(/\r?\n/).filter(s=>/^\s*\d+\s+\d+\s+image\s/.test(s));
const mediaPages=[...new Set(rows.map(s=>Number(s.trim().split(/\s+/)[0])))].sort((a,b)=>a-b);
assert.equal(mediaPages.length,7,'cover and six diagram-bearing PDF pages');
const pdf=await getDocument({data:new Uint8Array(await readFile(proofPdf)),useSystemFonts:true,isEvalSupported:false,disableFontFace:true}).promise;
const structures=[];
function inspect(node,result){
 if(!node||typeof node!=='object')return;
 if(node.role)result.roles[node.role]=(result.roles[node.role]||0)+1;
 if(/fig|image/i.test(node.role||''))result.figures.push({role:node.role,alt:node.alt||null,actualText:node.actualText||null,children:node.children?.length||0});
 for(const n of node.children||[])inspect(n,result);
}
try{
 for(const pageNum of mediaPages){
  const page=await pdf.getPage(pageNum);
  const st=await page.getStructTree();
  const summary={page:pageNum,tagTreePresent:Boolean(st?.children?.length),roles:{},figures:[]};
  inspect(st,summary);
  structures.push(summary);page.cleanup();
 }
}finally{await pdf.destroy();}
const missingFigureAssociation=figures.filter(x=>!x.containedInFigure&&!x.explicitCaptionId).length;
const figureTagCount=structures.reduce((s,p)=>s+p.figures.length,0);
const altFigureTagCount=structures.reduce((s,p)=>s+p.figures.filter(x=>x.alt?.trim()).length,0);
const report={
  test:'unpublished media-complete EPUB/PDF semantic audit',
  imagePages:mediaPages,
  epub:{language:'en',images:imgs,navTypes,a11yMeta,figureCount:figures.length,unassociatedFigureImages:missingFigureAssociation},
  pdf:{taggedPages:structures.filter(x=>x.tagTreePresent).length,inspectedPages:structures,figureTagCount,altFigureTagCount},
  humanReview:['Image title alternatives do not automatically describe diagram relationships','PDF tagged structure does not certify PDF/UA','A5 printed diagram label scale requires direct readability review'],
  limitations:['No released edition mutated','Not a screen-reader user test','Only seven image-bearing pages, not all-page scan']
};
console.log(JSON.stringify(report,null,2));
await writeFile(path.join(dir,'accessibility-semantics.json'),JSON.stringify(report,null,2));
assert.equal(structures.filter(x=>x.tagTreePresent).length,7,'tagged PDF page structure missing');
assert.equal(missingFigureAssociation,0,'EPUB diagram captions not structurally associated with image elements');
assert.ok(figures.every(x=>x.figureCaption?.startsWith('Figure — ')),'each diagram must retain its original associated caption');
assert.equal(altFigureTagCount,7,'tagged PDF figures do not expose seven nonempty alt descriptions');
