// Inspect every page of the temporary, non-release Chromium PDF using PDF.js.
// Zero-char and off-media text are hard defects; tiny final pages are reported
// as candidates for visual review rather than silently certified.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const dir=path.join(process.env.RUNNER_TEMP||'/tmp','book1-format-qa');
const raw=await readFile(path.join(dir,'how-to-love-god-UNPUBLISHED-QA.pdf'));
const task=getDocument({data:new Uint8Array(raw),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});
let doc;
const fail=[],short=[],pages=[];
try{
 doc=await task.promise;
 assert.ok(doc.numPages>51&&doc.numPages<900,'PDF page count plausible');
 let dims;
 for(let n=1;n<=doc.numPages;n++){
   const pg=await doc.getPage(n);
   const v=pg.getViewport({scale:1});
   const width=v.width,height=v.height;
   if(!dims)dims={width,height};
   if(Math.abs(dims.width-width)>0.5||Math.abs(dims.height-height)>0.5)fail.push({page:n,kind:'inconsistent-media',width,height});
   const content=await pg.getTextContent();
   const items=content.items.filter(i=>typeof i.str==='string'&&i.str.trim());
   const chars=items.reduce((s,i)=>s+i.str.trim().length,0);
   if(chars===0)fail.push({page:n,kind:'blank-no-text'});
   if(chars<110)short.push({page:n,chars});
   let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,extreme=0;
   for(const i of items){
     const x=i.transform[4], y=i.transform[5], w=Number(i.width)||0;
     const right=x+w;
     minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,right);maxY=Math.max(maxY,y);
     if(x < -6 || right > width+6 || y < -6 || y > height+6)extreme++;
   }
   if(extreme)fail.push({page:n,kind:'off-media-text',extreme,box:[minX,minY,maxX,maxY]});
   pages.push({page:n,chars,items:items.length,box:[minX,minY,maxX,maxY]});
   pg.cleanup();
 }
 const chars=pages.map(p=>p.chars);
 const report={kind:'ALL_PAGE_GEOMETRY_AUDIT',pages:doc.numPages,media:dims,blankPages:fail.filter(x=>x.kind==='blank-no-text'),
   offMediaPages:fail.filter(x=>x.kind==='off-media-text'),inconsistentSize:fail.filter(x=>x.kind==='inconsistent-media'),
   lowTextPages:short,textCharacters:{min:Math.min(...chars),max:Math.max(...chars),total:chars.reduce((a,b)=>a+b,0)},
   margins:{minLeft:Math.min(...pages.map(p=>p.box[0])),maxRight:Math.max(...pages.map(p=>p.box[2]))},
   totalProblems:fail.length,limitations:['Only text geometry; cannot guarantee no graphical overlap','No source-release parity or PDF/UA conformance']};
 await writeFile(path.join(dir,'page-audit.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 assert.equal(fail.length,0,'PDF contains blank or off-media pages');
}finally{if(doc)await task.destroy();}
