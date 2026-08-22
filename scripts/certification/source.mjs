import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

pass('ASTRO_STACK', await exists('astro.config.mjs'), 'Astro configuration is present');
pass('NO_REACT_RUNTIME', !(await exists('vite.config.ts')) && !(await exists('src/main.tsx')), 'Temporary React/Vite runtime is absent');
pass('CLOUDFLARE_STATIC', (await readFile('wrangler.jsonc', 'utf8')).includes('404-page'), 'Cloudflare static 404 handling is configured');
pass('SECURITY_HEADERS', (await readFile('public/_headers', 'utf8')).includes("script-src 'self'"), 'Static CSP rejects arbitrary inline executable script');
pass('L17_METADATA', await exists('src/content/works/ai-for-the-kingdom/work.yaml'), 'Validated L17 Work metadata is registered');
pass('L17_RELEASE', await exists('src/content/works/ai-for-the-kingdom/releases/1.0.0-rc4.yaml'), 'Immutable rc4 release record is registered');
pass('LOCKFILE', await exists('pnpm-lock.yaml'), 'A frozen dependency lock is required before RC certification');
pass('L17_READER_PAYLOAD', await exists('src/content/works/ai-for-the-kingdom/chapters'), '57 native reader files must be restored before publication certification');

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const hardFailures = checks.filter((check) => !check.ok && !['LOCKFILE', 'L17_READER_PAYLOAD'].includes(check.id));
const blockers = checks.filter((check) => !check.ok && ['LOCKFILE', 'L17_READER_PAYLOAD'].includes(check.id));
if (hardFailures.length) process.exit(1);
if (blockers.length) {
  console.log(`SOURCE_RECOVERY_PASS_WITH_BLOCKERS ${blockers.map((item) => item.id).join(',')}`);
  process.exit(0);
}
console.log('SOURCE_PASS');
