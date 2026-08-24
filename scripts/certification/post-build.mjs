import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
const required = [
  'pnpm-lock.yaml',
  'dist/_headers',
  'dist/library/index.html',
  'dist/library/search/index.html',
  'dist/library/sitemap.xml',
  'dist/library/pagefind/pagefind.js',
];
const missing = [];
for (const file of required) if (!(await exists(file))) missing.push(file);
if (missing.length) {
  console.error(`AUTOMATED_RC_BLOCKED missing: ${missing.join(', ')}`);
  process.exit(1);
}

const worksRoot = 'src/content/works';
for (const entry of await readdir(worksRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const work = YAML.parse(await readFile(path.join(worksRoot, entry.name, 'work.yaml'), 'utf8'));
  if (work.visibility !== 'public' || !['published', 'archived'].includes(work.status)) continue;

  const workHtmlPath = `dist/library/works/${work.slug}/index.html`;
  if (!(await exists(workHtmlPath))) throw new Error(`AUTOMATED_RC_BLOCKED missing work page ${work.slug}`);
  const workHtml = await readFile(workHtmlPath, 'utf8');
  const coverPath = `/library${work.cover.src}`;
  if (!workHtml.includes(coverPath)) throw new Error(`AUTOMATED_RC_BLOCKED ${work.id} work page is not using its canonical publication cover`);

  if (work.formats?.web?.enabled) {
    const readerRoot = `dist/library/works/${work.slug}/read`;
    if (!(await exists(path.join(readerRoot, 'index.html')))) throw new Error(`AUTOMATED_RC_BLOCKED missing reader index for ${work.id}`);
    const stack = [readerRoot];
    while (stack.length) {
      const dir = stack.pop();
      for (const child of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, child.name);
        if (child.isDirectory()) stack.push(full);
        else if (child.isFile() && child.name === 'index.html') {
          const html = await readFile(full, 'utf8');
          if (/\{#[A-Za-z][A-Za-z0-9_.:-]*\}/.test(html)) throw new Error(`AUTOMATED_RC_BLOCKED explicit manuscript heading ID leaked in ${full}`);
        }
      }
    }
  }
}

const aiAnchorPage = 'dist/library/works/ai-for-the-kingdom/read/what-makes-a-human-human/index.html';
if (await exists(aiAnchorPage)) {
  const html = await readFile(aiAnchorPage, 'utf8');
  if (!html.includes('id="human-hope-is-not-technical-superiority"')) throw new Error('AUTOMATED_RC_BLOCKED explicit AI for the Kingdom heading anchor was not preserved');
}

console.log('AUTOMATED_RC_SOURCE_BUILD_PASS');
