// Read-only format QA: real EPUB3 ZIP and Chromium tagged PDF from current draft.
// NEVER publish these proofs: they omit cover/figures and attribution is unresolved.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {DOMParser} from '@xmldom/xmldom';
import {createMarkdownProcessor} from '@astrojs/markdown-remark';
import {chromium} from '@playwright/test';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import remarkExplicitHeadingIds from '../../src/lib/markdown/remark-explicit-heading-ids.mjs';
const dir='src/content/works/how-to-love-god/chapters';
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parser=await createMarkdownProcessor({remarkPlugins:[remarkExplicitHeadingIds]});
const chapters=[];
for(const f of (await readdir(dir)).filter(f=>f.endsWith('.md'))){
 const raw=await readFile(dir+'/'+f,'utf8');
 const fm=raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
 assert.ok(fm,'YAML frontmatter: '+f);
 const field=k=>fm[1].match(new RegExp('^'+k+':\\s*(.+)$','m'))?.[1]?.trim()?.replace(/^['"]|['"]$/g,'');
 chapters.push({id:field('id'),title:field('title'),order:Number(field('order')),html:(await parser.render(raw.slice(fm[0].length))).code});
}
chapters.sort((a,b)=>a.order-b.order);
assert.equal(chapters.length,51);
const ids=new Set(chapters.map(x=>x.id));assert.equal(ids.size,51);
const appendix=chapters.find(x=>x.id==='appendix-l-sources-notes-and-further-reading');
assert.equal([...appendix.html.matchAll(/id="note-\d+-\d+"/g)].length,20);
const withMedia=process.env.BOOK1_MEDIA_PROOF==='1';
const proofDir=path.join(process.env.RUNNER_TEMP||'/tmp','book1-format-qa');
const mediaByUrl=new Map();
const mediaByKey=new Map();
if(withMedia){
  const verified=JSON.parse(await readFile(path.join(proofDir,'media-verification.json'),'utf8'));
  assert.equal(verified.length,7,'seven release media expected');
  for(const obj of verified){
    assert.equal(obj.verified,true,'media checksum not verified '+obj.key);
    const bytes=await readFile(path.join(proofDir,'media',obj.name));
    assert.equal(bytes.length,obj.size,'media size '+obj.key);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),obj.sha256,'media hash '+obj.key);
    mediaByUrl.set(obj.url,{...obj,bytes});
    mediaByKey.set(obj.key,{...obj,bytes});
  }
  assert.equal(mediaByUrl.size,7);
  assert.ok(mediaByKey.has('cover'));
}
let linksPdf=0,linksEpub=0,figures=0;
const transform=(html,format)=>html.replace(/href="\.\/([a-z0-9-]+)(#[a-zA-Z0-9_.:-]+)"/g,(_m,id,anchor)=>{
 assert.ok(ids.has(id),'unknown chapter '+id);
 if(format==='pdf'){linksPdf++;return 'href="'+anchor+'"';}
 linksEpub++;return 'href="'+id+'.xhtml'+anchor+'"';
}).replace(/<img\b([^>]*?)>/g,(_m,attrs)=>{
 const alt=attrs.match(/\balt="([^"]+)"/)?.[1];assert.ok(alt,'alt');
 if(format==='pdf') figures++;
 if(withMedia){
   const src=attrs.match(/\bsrc="([^"]+)"/)?.[1];
   const media=mediaByUrl.get(src);
   assert.ok(media&&media.key!=='cover','verified figure missing: '+src);
   if(format==='pdf')return '<img class="proof-figure" src="data:'+media.mime+';base64,'+media.bytes.toString('base64')+'" alt="'+esc(alt)+'"/>';
   return '<img src="../images/'+media.name+'" alt="'+esc(alt)+'"/>';
 }
 return '<span role="img" aria-label="'+esc(alt)+'">[QA image omitted: '+alt+']</span>';
});
const zip=new JSZip();
zip.file('mimetype','application/epub+zip',{compression:'STORE'});
zip.file('META-INF/container.xml','<?xml version="1.0" encoding="UTF-8"?>'+
 '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
const epubs=new Map();
for(const x of chapters){
 const content=transform(x.html,'epub').replace(/<br(\s[^>]*)?>/gi,'<br$1/>').replace(/<hr(\s[^>]*)?>/gi,'<hr$1/>');
 const body='<?xml version="1.0" encoding="utf-8"?>'+
  '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>'+esc(x.title)+'</title></head><body><main><h1>'+esc(x.title)+'</h1>'+content+'</main></body></html>';
 epubs.set(x.id,body);zip.file('OEBPS/text/'+x.id+'.xhtml',body);
}
const nav='<?xml version="1.0" encoding="utf-8"?>'+
 '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>'+
 (withMedia?'<li><a href="cover.xhtml">Cover</a></li>':'')+chapters.map(x=>'<li><a href="text/'+x.id+'.xhtml">'+esc(x.title)+'</a></li>').join('')+
 '</ol></nav></body></html>';
zip.file('OEBPS/nav.xhtml',nav);
const opf='<?xml version="1.0" encoding="UTF-8"?>'+
 '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en" prefix="schema: http://schema.org/"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'+
 '<dc:identifier id="bookid">urn:uuid:1d0566b3-a9a1-4fed-b64c-1915c1d303a1</dc:identifier>'+
 '<dc:title>How to Love God — unpublished QA only</dc:title><dc:language>en</dc:language>'+
 '<dc:creator>Thiepn (source metadata, ownership unresolved)</dc:creator>'+
 '<meta property="dcterms:modified">2026-10-30T00:00:00Z</meta>'+
 '<meta property="schema:accessMode">textual</meta><meta property="schema:accessibilityFeature">tableOfContents</meta>'+
 '</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'+
 (withMedia?'<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>'+[...mediaByKey.values()].map(x=>'<item id="'+x.key+'" href="images/'+x.name+'" media-type="'+x.mime+'"'+(x.key==='cover'?' properties="cover-image"':'')+'/>').join(''):'')+chapters.map((x,i)=>'<item id="s'+i+'" href="text/'+x.id+'.xhtml" media-type="application/xhtml+xml"/>').join('')+
 '</manifest><spine>'+(withMedia?'<itemref idref="cover-page"/>':'')+chapters.map((_x,i)=>'<itemref idref="s'+i+'"/>').join('')+'</spine></package>';
zip.file('OEBPS/content.opf',opf);
if(withMedia){
  for(const asset of mediaByKey.values())zip.file('OEBPS/images/'+asset.name,asset.bytes,{binary:true});
  const cover=mediaByKey.get('cover');
  const coverPage='<?xml version="1.0" encoding="utf-8"?>'+
    '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>Cover</title></head><body>'+
    '<section><h1>How to Love God</h1><img src="images/'+cover.name+'" alt="Cover of How to Love God"/></section></body></html>';
  zip.file('OEBPS/cover.xhtml',coverPage);
}

const epub=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
assert.equal(epub.readUInt32LE(0),0x04034b50);
assert.equal(epub.readUInt16LE(8),0,'first mimetype entry stored');
assert.equal(epub.subarray(30,38).toString(),'mimetype');
const unpacked=await JSZip.loadAsync(epub,{checkCRC32:true});
assert.equal(Object.keys(unpacked.files).filter(x=>!x.endsWith('/')).length,withMedia?63:55);
const xmlProblems=[];
const xml=(name,txt)=>{
 const errors=[];const doc=new DOMParser({onError:(level,message)=>{errors.push(String(level)+': '+String(message));}}).parseFromString(txt,'application/xml');
 if(errors.length) xmlProblems.push({name,errors:errors.slice(0,3)});
 return doc;
};
xml('container',await unpacked.file('META-INF/container.xml').async('string'));
const spine=xml('opf',await unpacked.file('OEBPS/content.opf').async('string'));
assert.equal(spine.getElementsByTagName('itemref').length,withMedia?52:51);
assert.equal(xml('nav',await unpacked.file('OEBPS/nav.xhtml').async('string')).getElementsByTagName('a').length,withMedia?52:51);
let validated=0;
for(const [id,content] of epubs){
 const doc=xml(id,await unpacked.file('OEBPS/text/'+id+'.xhtml').async('string'));
 for(const a of Array.from(doc.getElementsByTagName('a'))){
  const href=a.getAttribute('href');
  if(!href?.includes('.xhtml#'))continue;
  const [file,anchor]=href.split('#');const dest=file.slice(0,-6);
  assert.ok(epubs.has(dest),'missing source chapter '+id+' -> '+file);
  assert.ok(epubs.get(dest).includes('id="'+anchor+'"'),'missing EPUB anchor '+id+' -> '+href);
  validated++;
 }
}
assert.equal(xmlProblems.length,0,JSON.stringify(xmlProblems.slice(0,3)));
assert.equal(linksEpub,40);assert.equal(validated,40);
if(withMedia){
  for(const asset of mediaByKey.values()){
    const bytes=await unpacked.file('OEBPS/images/'+asset.name).async('nodebuffer');
    assert.equal(bytes.length,asset.size,'embedded image length '+asset.key);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,'embedded EPUB image SHA-256 '+asset.key);
  }
  const coverDoc=xml('cover',await unpacked.file('OEBPS/cover.xhtml').async('string'));
  assert.equal(coverDoc.getElementsByTagName('img').length,1);
}
const css=['@page{size:A5;margin:18mm 16mm 19mm}','html{color:#171717;font:11pt/1.53 Georgia,serif}',
 'h1{font-size:20pt;break-before:page;break-after:avoid}','h2,h3{break-after:avoid}',
 'p,li{orphans:2;widows:2}','a{color:#162d53;text-decoration:underline}',
 'blockquote{border-left:2px solid #999;padding-left:9pt}',
 'table{border-collapse:collapse;width:100%}','td,th{border:1px solid #aaa;padding:3pt}', 'img.proof-figure{display:block;max-width:100%;max-height:98mm;object-fit:contain;break-inside:avoid;margin:8pt auto}', '.proof-cover{break-after:page;text-align:center}.proof-cover img{max-height:145mm;max-width:100%;object-fit:contain}'].join('');
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><style>'+css+'</style></head><body><main>'+
 (withMedia?'<section class="proof-cover"><h2>How to Love God</h2><img src="data:image/webp;base64,'+mediaByKey.get('cover').bytes.toString('base64')+'" alt="Cover of How to Love God"/></section>':'')+
 chapters.map(x=>'<section id="chapter-'+x.id+'"><h1>'+esc(x.title)+'</h1>'+transform(x.html,'pdf')+'</section>').join('')+
 '</main></body></html>';
assert.equal(linksPdf,40);assert.equal(figures,6);
const browser=await chromium.launch({headless:true});
let pdf;
try{
 const page=await browser.newPage();
 await page.setContent(html,{waitUntil:'domcontentloaded'});
 if(withMedia){
   const images=await page.evaluate(()=>[...document.images].map(x=>({ok:x.complete&&x.naturalWidth>0,alt:x.alt})));
   assert.equal(images.length,7,'one cover and six diagrams in PDF print DOM');
   assert.ok(images.every(x=>x.ok&&x.alt),'all actual figures decoded and have alt');
 }
 const broken=await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.href));
 assert.deepEqual(broken,[]);
 pdf=await page.pdf({preferCSSPageSize:true,printBackground:true,tagged:true,outline:true});
}finally{await browser.close();}
assert.ok(pdf.subarray(0,5).toString()==='%PDF-');
const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:true,isEvalSupported:false,disableFontFace:true});
let pages,linkAnnotations=0,taggedPages=0;
const samples=[];
try{
 const doc=await task.promise;pages=doc.numPages;
 assert.ok(pages>51&&pages<900,'PDF A5 pages '+pages);
 for(const no of [1,Math.ceil(pages/2),pages]){
  const p=await doc.getPage(no);
  const txt=await p.getTextContent();
  const tree=await p.getStructTree();
  if(tree?.children?.length)taggedPages++;
  samples.push({page:no,chars:txt.items.map(x=>x.str||'').join('').length});
 }
 for(let i=1;i<=pages;i++){
  const p=await doc.getPage(i);
  linkAnnotations+=(await p.getAnnotations({intent:'display'})).filter(x=>x.subtype==='Link'&&x.dest).length;
  p.cleanup();
 }
 assert.ok(linkAnnotations>=20,'PDF internal links '+linkAnnotations);
 assert.ok(taggedPages>0,'PDF accessibility tag tree absent');
}finally{await task.destroy();}
// Files exist ONLY inside the trusted runner's ephemeral directory.
// Reuse proofDir from the verified-media setup.
await mkdir(proofDir,{recursive:true,mode:0o700});
await writeFile(path.join(proofDir,'how-to-love-god-UNPUBLISHED-QA.epub'),epub,{mode:0o600});
await writeFile(path.join(proofDir,'how-to-love-god-UNPUBLISHED-QA.pdf'),pdf,{mode:0o600});
console.log('EPHEMERAL_QA_PATH='+proofDir);
console.log(JSON.stringify({verdict:'ISOLATED_SOURCE_FORMAT_PASS',sections:51,
 epub:{bytes:epub.length,sha256:createHash('sha256').update(epub).digest('hex'),zipEntries:withMedia?63:55,
       toc:withMedia?52:51,spine:withMedia?52:51,endnoteTargets:validated,xmlErrors:xmlProblems.length,embeddedMedia:withMedia?7:0,pagination:'reflowable/not applicable'},
 pdf:{bytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex'),pages,internalLinkAnnotations:linkAnnotations,taggedSamplePages:taggedPages,extractedTextSamples:samples},
 figureBinariesOmitted:withMedia?0:6,coverEmbedded:withMedia,limitations:[withMedia?'Media verified and embedded in unpublished QA proofs only':'NOT publication-ready: figures and cover intentionally omitted',
 'No PDF/UA or EPUBCheck conformance claims','PDF/EPUB not deployed or uploaded','Rights attribution remains held',
 'Not the complete Astro app build or physical-reader review']},null,2));
