import { access, readFile, readdir } from 'node:fs/promises';
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const required = [
  'pnpm-lock.yaml',
  'dist/_headers',
  'dist/library/index.html',
  'dist/library/search/index.html',
  'dist/library/sitemap.xml',
  'dist/library/pagefind/pagefind.js',
  'dist/library/works/ai-for-the-kingdom/index.html',
  'dist/library/works/ai-for-the-kingdom/read/what-makes-a-human-human/index.html',
];
const missing = [];
for (const path of required) if (!(await exists(path))) missing.push(path);
if (missing.length) {
  console.error(`AUTOMATED_RC_BLOCKED missing: ${missing.join(', ')}`);
  process.exit(1);
}
const workDir = 'src/content/works/ai-for-the-kingdom/chapters';
const count = await exists(workDir) ? (await readdir(workDir)).filter((name) => /\.(md|mdx)$/i.test(name)).length : 0;
if (count !== 57) {
  console.error(`AUTOMATED_RC_BLOCKED expected 57 AI for the Kingdom reader files, found ${count}`);
  process.exit(1);
}

const readerHtml = await readFile('dist/library/works/ai-for-the-kingdom/read/what-makes-a-human-human/index.html', 'utf8');
if (/\{#[A-Za-z][A-Za-z0-9_.:-]*\}/.test(readerHtml)) {
  console.error('AUTOMATED_RC_BLOCKED explicit manuscript heading IDs leaked into reader text');
  process.exit(1);
}
if (!readerHtml.includes('id="human-hope-is-not-technical-superiority"')) {
  console.error('AUTOMATED_RC_BLOCKED explicit manuscript heading anchor was not preserved');
  process.exit(1);
}

const workHtml = await readFile('dist/library/works/ai-for-the-kingdom/index.html', 'utf8');
const frozenCover = '/library/media/works/ai-for-the-kingdom/editions/1.0.0-rc4/ai-for-the-kingdom.webp';
if (!workHtml.includes(frozenCover)) {
  console.error('AUTOMATED_RC_BLOCKED work page is not using the frozen publication cover');
  process.exit(1);
}

console.log('AUTOMATED_RC_SOURCE_BUILD_PASS');
