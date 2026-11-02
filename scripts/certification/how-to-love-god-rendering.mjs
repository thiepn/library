// Book 1: independently render every exact-source Markdown page with the same
// Astro unified Markdown processor and explicit-heading-ID plugin as the site.
// This is NOT a complete Astro app build or an EPUB/PDF renderer.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { parseHTML } from 'linkedom';
import remarkExplicitHeadingIds from '../../src/lib/markdown/remark-explicit-heading-ids.mjs';

const ROOT = 'src/content/works/how-to-love-god/chapters';
const SITE = 'https://thiepn.dev';
const route = (id) => '/library/works/how-to-love-god/read/' + id;
const filenames = (await readdir(ROOT)).filter(f => f.endsWith('.md'));
const processor = await createMarkdownProcessor({ remarkPlugins: [remarkExplicitHeadingIds] });
const pages = new Map();
const failures = [];
const counter = { sections: 0, headings: 0, images: 0, anchors: 0, links: 0, localLinks: 0, crossPageNotes: 0 };
for (const file of filenames) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, 'frontmatter: ' + file);
  const get = (k) => match[1].match(new RegExp('^' + k + ':\\s*(.+)$', 'm'))?.[1]?.trim()?.replace(/^['"]|['"]$/g, '');
  const id = get('id'), title = get('title'), order = Number(get('order'));
  assert.ok(id && title && Number.isInteger(order), 'canonical metadata: ' + file);
  const rendered = await processor.render(source.slice(match[0].length));
  const { document } = parseHTML('<!DOCTYPE html><html><body><main class="reader-prose">' + rendered.code + '</main></body></html>');
  assert.ok(!pages.has(id), 'duplicate id ' + id);
  pages.set(id, { id, file, title, order, document, html: rendered.code });
  counter.sections++;
  for (const heading of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    counter.headings++;
    if (!heading.id) failures.push(file + ': heading without id: ' + heading.textContent.trim().slice(0,50));
  }
  for (const img of document.querySelectorAll('img')) {
    counter.images++;
    if (!img.getAttribute('alt')?.trim()) failures.push(file + ': missing image alt: ' + img.getAttribute('src'));
  }
  for (const a of document.querySelectorAll('a')) {
    counter.links++;
    if (!a.getAttribute('href')) failures.push(file + ': missing anchor href');
  }
}
const pagesByURL = new Map([...pages.values()].map(p => [route(p.id), p]));
for (const page of pages.values()) {
  const ids = [...page.document.querySelectorAll('[id]')].map(x => x.id);
  if (ids.length !== new Set(ids).size) failures.push(page.file + ': duplicate HTML IDs');
  counter.anchors += ids.length;
  for (const a of page.document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    if (href.startsWith('//')) continue;
    const target = new URL(href, SITE + route(page.id));
    if (target.origin !== SITE) continue;
    if (!target.pathname.startsWith('/library/works/how-to-love-god/read/')) continue;
    counter.localLinks++;
    const dest = pagesByURL.get(target.pathname);
    if (!dest) { failures.push(page.file + ': unresolved reader page ' + href); continue; }
    if (target.hash) {
      const id = decodeURIComponent(target.hash.slice(1));
      if (!dest.document.getElementById(id)) {
        failures.push(page.file + ': unresolved reader anchor ' + href + ' (resolved page ' + dest.id + ')');
      } else if (/^(?:note|ref)-\d+-\d+$/.test(id)) counter.crossPageNotes++;
    }
  }
}
console.log(JSON.stringify({
  kind: 'actual-unified-markdown-rendering',
  processor: '@astrojs/markdown-remark and repository heading-ID plugin',
  ...counter, failures: failures.length, firstFailures: failures.slice(0,60),
  caveat: 'Not the complete Astro build or native EPUB/PDF; browser layout tested separately',
}, null, 2));
assert.equal(counter.sections, 51);
assert.equal(failures.length, 0, 'rendered source contains broken links or accessibility identifiers');
