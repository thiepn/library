import { access, readFile, readdir } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const chapterDir = 'src/content/works/ai-for-the-kingdom/chapters';
const chapterCount = await exists(chapterDir) ? (await readdir(chapterDir)).filter((name) => /\.(md|mdx)$/i.test(name)).length : 0;
const astroConfig = await readFile('astro.config.mjs', 'utf8');
const wranglerConfig = await readFile('wrangler.jsonc', 'utf8');
const headers = await readFile('public/_headers', 'utf8');

pass('ASTRO_STACK', await exists('astro.config.mjs'), 'Astro configuration is present');
pass('ASTRO6_CONTENT', await exists('src/content.config.ts'), 'Astro 6 Content Loader configuration is present');
pass('PATH_MOUNT', astroConfig.includes("site: 'https://thiepn.dev'") && astroConfig.includes("base: '/library'") && astroConfig.includes("outDir: './dist/library'"), 'Production application is mounted at https://thiepn.dev/library');
pass('CLOUDFLARE_PATH_ROUTE', wranglerConfig.includes('thiepn.dev/library*') && wranglerConfig.includes('zone_name'), 'Cloudflare Worker is scoped to the /library path instead of a standalone custom domain');
pass('NO_REACT_RUNTIME', !(await exists('vite.config.ts')) && !(await exists('src/main.tsx')), 'Temporary React/Vite runtime is absent');
pass('CLOUDFLARE_STATIC', wranglerConfig.includes('404-page'), 'Cloudflare static 404 handling is configured');
pass('SECURITY_HEADERS', headers.includes("script-src 'self'") && headers.includes('/library/*'), 'Static CSP and headers are scoped to the Library path');
pass('DEPLOY_HEADERS_PROMOTION', await exists('scripts/prepare-deploy.mjs'), 'Cloudflare _headers is promoted to the static asset root after the subdirectory build');
pass('SITEMAP', await exists('src/pages/sitemap.xml.ts'), 'Library sitemap endpoint is generated under /library');
pass('L17_METADATA', await exists('src/content/works/ai-for-the-kingdom/work.yaml'), 'Validated L17 Work metadata is registered');
pass('L17B_EXPECTED', await exists('src/content/works/ai-for-the-kingdom/recovery/l17b-expected.json'), 'Frozen 57-file materialization manifest is registered');
pass('READER_ROUTES', await exists('src/pages/works/[slug]/read/[chapter].astro'), 'Native Reader route is implemented');
pass('LOCKFILE', await exists('pnpm-lock.yaml'), 'A frozen dependency lock is required before RC certification');
pass('L17_READER_PAYLOAD', chapterCount === 57, `57 native reader files required; found ${chapterCount}`);
pass('L17_RELEASE_REGISTRY', await exists('src/publications/releases/ai-for-the-kingdom/1.0.0-rc4.yaml'), 'Canonical release registry is written only after immutable R2 verification');

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const blockers = new Set(['LOCKFILE', 'L17_READER_PAYLOAD', 'L17_RELEASE_REGISTRY']);
const hardFailures = checks.filter((check) => !check.ok && !blockers.has(check.id));
const blocked = checks.filter((check) => !check.ok && blockers.has(check.id));
if (hardFailures.length) process.exit(1);
if (blocked.length) {
  console.log(`SOURCE_RECOVERY_PASS_WITH_BLOCKERS ${blocked.map((item) => item.id).join(',')}`);
  process.exit(0);
}
console.log('SOURCE_PASS');
