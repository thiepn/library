import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
const required = [
  'pnpm-lock.yaml',
  'dist/_headers',
  'dist/library/index.html',
  'dist/library/search/index.html',
  'dist/library/downloads/index.html',
  'dist/library/sitemap.xml',
  'dist/library/pagefind/pagefind.js',
  'dist/library/service-worker.js',
  'dist/library/manifest.webmanifest',
  'dist/library/offline-assets.json',
  'dist/library/app-icon.svg',
  'dist/library/app-icon-maskable.svg',
  'dist/library/offline/index.html',
];
const missing = [];
for (const file of required) if (!(await exists(file))) missing.push(file);
if (missing.length) {
  console.error(`AUTOMATED_RC_BLOCKED missing: ${missing.join(', ')}`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile('dist/library/manifest.webmanifest', 'utf8'));
if (manifest.id !== '/library/' || manifest.start_url !== '/library/' || manifest.scope !== '/library/' || manifest.display !== 'standalone') {
  throw new Error('AUTOMATED_RC_BLOCKED manifest scope/install metadata is invalid');
}
if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon.purpose === 'maskable')) {
  throw new Error('AUTOMATED_RC_BLOCKED manifest is missing its maskable install icon');
}

const offlineAssets = JSON.parse(await readFile('dist/library/offline-assets.json', 'utf8'));
if (offlineAssets.schemaVersion !== 1 || !Array.isArray(offlineAssets.assets) || !offlineAssets.assets.length) {
  throw new Error('AUTOMATED_RC_BLOCKED RR5 offline application asset manifest is missing or empty');
}
if (!offlineAssets.assets.every((asset) => typeof asset === 'string' && asset.startsWith('/library/_astro/'))) {
  throw new Error('AUTOMATED_RC_BLOCKED RR5 offline application asset manifest contains a non-hashed-app path');
}
for (const asset of offlineAssets.assets) {
  const local = path.join('dist/library', asset.slice('/library/'.length));
  if (!(await exists(local))) throw new Error(`AUTOMATED_RC_BLOCKED RR5 offline application asset is missing: ${asset}`);
}

const serviceWorker = await readFile('dist/library/service-worker.js', 'utf8');
if (!serviceWorker.includes("const SW_VERSION = 'rr5-v1'")
  || !serviceWorker.includes("const CACHE_PREFIX = 'thiepn-library-pwa-'")
  || !serviceWorker.includes("const HOSTED_PUBLICATION_CACHE = 'thiepn-library-offline-publications-v1'")
  || !serviceWorker.includes("url.pathname.startsWith(scoped('media/'))")
  || !serviceWorker.includes('/\\.epub$/i.test(url.pathname)')
  || !serviceWorker.includes('/\\.pdf$/i.test(url.pathname)')
  || !serviceWorker.includes("data.type === 'CACHE_OFFLINE_PUBLICATION'")
  || !serviceWorker.includes('async function rangedResponse')) {
  throw new Error('AUTOMATED_RC_BLOCKED RR5 service-worker explicit publication/offline range contract is missing');
}

const downloadsHtml = await readFile('dist/library/downloads/index.html', 'utf8');
if (!downloadsHtml.includes('Offline downloads') || !downloadsHtml.includes('data-offline-library')) {
  throw new Error('AUTOMATED_RC_BLOCKED RR5 offline-download manager was not built');
}

const offlineHtml = await readFile('dist/library/offline/index.html', 'utf8');
if (!offlineHtml.includes('You’re offline.') || !offlineHtml.includes('<style')) {
  throw new Error('AUTOMATED_RC_BLOCKED self-contained offline fallback was not built');
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
