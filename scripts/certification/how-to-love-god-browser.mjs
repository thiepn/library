// Isolated Book 1 browser acceptance. Renders canonical Markdown with the
// site's actual unified parser and loads the site's original reader CSS.
// The shell is a read-only HTML fixture mirroring ReaderLayout.astro, not an
// Astro production build: PWA, account, binary media and scripts NOT tested.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import remarkExplicitHeadingIds from '../../src/lib/markdown/remark-explicit-heading-ids.mjs';

const DIR = 'src/content/works/how-to-love-god/chapters';
const route = id => '/library/works/how-to-love-god/read/' + id;
const esc = str => String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const files = (await readdir(DIR)).filter(f => f.endsWith('.md'));
const processor = await createMarkdownProcessor({ remarkPlugins: [remarkExplicitHeadingIds] });
const css = (await Promise.all(['src/styles/global.css','src/styles/reader.css','src/styles/reader-device-ux.css'].map(f=>readFile(f,'utf8')))).join('\n');
const chapters = [];
for (const file of files) {
  const raw = await readFile(path.join(DIR,file),'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(fm, 'YAML header '+file);
  const prop = key => fm[1].match(new RegExp('^'+key+':\\s*(.+)$','m'))?.[1]?.trim()?.replace(/^['"]|['"]$/g,'');
  const rendered = await processor.render(raw.slice(fm[0].length));
  chapters.push({ id:prop('id'), title:prop('title'), order:Number(prop('order')), html:rendered.code });
}
chapters.sort((a,b)=>a.order-b.order);
assert.equal(chapters.length,51);
const markup = chapters.map((ch,i)=>{
  const list = chapters.map(item=>'<li'+(item.id===ch.id?' class="active"':'')+'><a href="'+route(item.id)+'">'+esc(item.title)+'</a></li>').join('');
  const prev=chapters[i-1], next=chapters[i+1];
  const nav='<nav class="reader-chapter-nav" aria-label="Chapter navigation">'+
    (prev?'<a href="'+route(prev.id)+'"><span>Previous</span><strong>'+esc(prev.title)+'</strong></a>':'<span></span>')+
    (next?'<a class="next" href="'+route(next.id)+'"><span>Next</span><strong>'+esc(next.title)+'</strong></a>':'<a class="next" href="/library/works/how-to-love-god"><span>Finished</span><strong>Back to publication</strong></a>')+
    '</nav>';
  return { path:route(ch.id), html:'<!doctype html><html lang="en-US"><head><meta charset="UTF-8"/>'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>'+
    '<title>'+esc(ch.title)+' — How to Love God</title><style>'+css+'</style></head>'+
    '<body class="reader-body"><a class="skip-link" href="#reader-content">Skip to chapter</a>'+
    '<header class="reader-bar"><a class="reader-back" href="/library/works/how-to-love-god">How to Love God</a>'+
    '<div class="reader-tools" aria-label="Reading controls"><button type="button" data-reader-action="smaller" aria-label="Decrease text size">A−</button>'+
    '<button type="button" data-reader-action="larger" aria-label="Increase text size">A+</button>'+
    '<button type="button" data-reader-action="measure" aria-label="Change line length">Measure</button></div></header>'+
    '<details class="reader-mobile-toc"><summary>Contents · '+(i+1)+' / '+chapters.length+'</summary><ol>'+list+'</ol></details>'+
    '<main class="reader-shell"><aside class="reader-toc" aria-label="Table of contents"><p class="eyebrow">Contents</p><ol>'+list+'</ol></aside>'+
    '<article id="reader-content" class="reader-document" data-chapter-id="'+ch.id+'">'+
    '<header class="chapter-header"><p class="eyebrow">How to Love God</p><h1>'+esc(ch.title)+'</h1></header>'+
    '<div class="reader-prose">'+ch.html+'</div>'+nav+'</article></main></body></html>' };
});
const pages = new Map(markup.map(x=>[x.path,x.html]));
const server = createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  const html = pages.get(pathname);
  if(html){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);}
  else {res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}, colorScheme:'light', reducedMotion:'reduce'});
await context.route(/^https?:\/\//, routeRequest=>{
  if(routeRequest.request().url().startsWith(origin)) return routeRequest.continue();
  return routeRequest.abort(); // Never fabricate or claim remote media loading.
});
const page=await context.newPage();
const violations=[];
let visited=0, imgCount=0;
try{
 for(const ch of chapters){
  const resp=await page.goto(origin+route(ch.id),{waitUntil:'domcontentloaded'});
  assert.equal(resp.status(),200,'route '+ch.id);
  const result=await page.evaluate(()=>{
    const article=document.querySelector('.reader-document');
    const prose=document.querySelector('.reader-prose');
    const styles=getComputedStyle(article);
    return {
      pageTitle:document.title,
      h1:document.querySelectorAll('h1').length,
      proseChars:prose.textContent.trim().length,
      width:document.documentElement.scrollWidth,
      viewport:window.innerWidth,
      font:parseFloat(styles.fontSize),
      leading:parseFloat(styles.lineHeight)/parseFloat(styles.fontSize),
      mobileMenu:getComputedStyle(document.querySelector('.reader-mobile-toc')).display,
      desktopMenu:getComputedStyle(document.querySelector('.reader-toc')).display,
      imgAltMissing:[...prose.querySelectorAll('img')].filter(x=>!x.getAttribute('alt')?.trim()).length,
      images:prose.querySelectorAll('img').length,
      headingsNoId:[...prose.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(x=>!x.id).length,
      articleVisible:article.getBoundingClientRect().width>0,
    };
  });
  if(result.h1!==1||result.proseChars<45||result.width>result.viewport+2||
    result.font<17||result.font>20||result.leading<1.5||result.imgAltMissing||result.headingsNoId||
    result.mobileMenu==='none'||result.desktopMenu!=='none'||!result.articleVisible){
    violations.push({id:ch.id,...result});
  }
  visited++;imgCount+=result.images;
 }
 assert.equal(violations.length,0,'mobile render issues '+JSON.stringify(violations.slice(0,8)));
 for(const width of [1280,768,320]){
  await page.setViewportSize({width,height:850});
  for(const id of [chapters[0].id,'accepted-in-christ-justification-adoption-and-assurance','appendix-l-sources-notes-and-further-reading',chapters.at(-1).id]){
   await page.goto(origin+route(id),{waitUntil:'domcontentloaded'});
   const r=await page.evaluate(()=>({
     width:document.documentElement.scrollWidth, viewport:innerWidth,
     desktopMenu:getComputedStyle(document.querySelector('.reader-toc')).display,
     mobileMenu:getComputedStyle(document.querySelector('.reader-mobile-toc')).display,
     titleVisible:document.querySelector('h1').getBoundingClientRect().width>0,
   }));
   if(r.width>r.viewport+2||!r.titleVisible||(width>900 && r.desktopMenu==='none')||
      (width<=900 && r.mobileMenu==='none')) violations.push({id,width,...r});
  }
 }
 assert.equal(violations.length,0,'responsive layout issues '+JSON.stringify(violations.slice(0,8)));
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+route('accepted-in-christ-justification-adoption-and-assurance'));
 await page.locator('.endnote-call a').first().click();
 assert.ok(page.url().endsWith('/appendix-l-sources-notes-and-further-reading#note-7-1'),'source note navigation');
 assert.equal(await page.locator('#note-7-1').count(),1);
 await page.locator('a[href$="#ref-7-1"]').click();
 assert.ok(page.url().endsWith('/accepted-in-christ-justification-adoption-and-assurance#ref-7-1'),'endnote backlink');
 assert.equal(await page.locator('#ref-7-1').count(),1);
 await page.goto(origin+route(chapters[0].id));
 await page.locator('.reader-chapter-nav a.next').click();
 assert.ok(page.url().endsWith(route(chapters[1].id)),'next chapter navigation');
 const a11y=[];
 for(const id of ['accepted-in-christ-justification-adoption-and-assurance','appendix-l-sources-notes-and-further-reading']){
  await page.goto(origin+route(id),{waitUntil:'domcontentloaded'});
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  a11y.push({id,violations:audit.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.length,examples:x.nodes.slice(0,2).map(n=>n.target)}))});
 }
 console.log(JSON.stringify({kind:'standalone-real-chromium-exact-source',renderedRoutes:visited,responsiveCases:12,
  markdownProcessor:'Astro unified plus original heading plugin',styles:'original global/reader/device CSS',
  chapterLinkNavigation:'PASS',footnoteRoundTrip:'PASS',imageAltChecked:imgCount,
  a11y,violations,limitations:['ReaderLayout HTML shell mirrored, not Astro compiled','Native EPUB/PDF not rendered','Remote images intentionally not requested','Account integration not executed']},null,2));
 assert.equal(a11y.flatMap(x=>x.violations).length,0,'WCAG A/AA automated violations');
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
