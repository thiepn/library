import { readFile, rm, writeFile } from 'node:fs/promises';

const file = 'scripts/certification/performance-budget.mjs';
let content = await readFile(file, 'utf8');
const before = `    pdfRuntime.includes("this.cancelSearch('Search cancelled.')")
      && pdfRuntime.includes('this.searchAbort?.abort()')`;
const after = `    pdfRuntime.includes('const wasSearching = Boolean(this.searchAbort)')
      && pdfRuntime.includes("this.cancelSearch(wasSearching ? 'Search cancelled.' : undefined)")
      && pdfRuntime.includes('this.searchAbort?.abort()')`;
const count = content.split(before).length - 1;
if (count !== 1) throw new Error(`Expected one RR4 PDF certificate anchor, found ${count}.`);
content = content.replace(before, after);
await writeFile(file, content, 'utf8');
await rm('scripts/rr4-cert-fix.mjs', { force: true });
console.log('RR4_CERTIFICATE_FIXED');
