import { readFile, rm, writeFile } from 'node:fs/promises';

const target = 'scripts/rr4-apply.mjs';
let content = await readFile(target, 'utf8');
const before = `  content = replaceOnce(content,
\`    this.searchAbort?.abort();
    delete this.searchAbort;\`,
\`    this.cancelSearch();\`,
    'PDF reset search cancellation');`;
const after = `  content = replaceOnce(content,
\`  private async resetDocument() {
    this.renderGeneration += 1;
    this.renderTask?.cancel();
    this.textLayer?.cancel();
    delete this.renderTask;
    delete this.textLayer;
    this.searchAbort?.abort();
    delete this.searchAbort;\`,
\`  private async resetDocument() {
    this.renderGeneration += 1;
    this.renderTask?.cancel();
    this.textLayer?.cancel();
    delete this.renderTask;
    delete this.textLayer;
    this.cancelSearch();\`,
    'PDF reset search cancellation');`;
const matches = content.split(before).length - 1;
if (matches !== 1) throw new Error(`Expected one RR4 reset patch anchor, found ${matches}.`);
content = content.replace(before, after);
await writeFile(target, content, 'utf8');
await import('./rr4-apply.mjs?repair=1');
await rm('scripts/rr4-repair.mjs', { force: true });
await rm('.github/workflows/rr4-repair.yml', { force: true });
console.log('RR4_REPAIR_APPLIED');
