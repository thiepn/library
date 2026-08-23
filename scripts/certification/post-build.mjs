import { access, readdir } from 'node:fs/promises';
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const required = ['pnpm-lock.yaml', 'dist/library/index.html', 'dist/library/search/index.html', 'dist/library/pagefind/pagefind.js'];
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
console.log('AUTOMATED_RC_SOURCE_BUILD_PASS');
