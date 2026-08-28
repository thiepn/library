import { readFile, rm, writeFile } from 'node:fs/promises';

const files = [
  'tests/performance/performance-fixtures.ts',
  'scripts/certification/performance-budget.mjs',
];
const before = 'RR4-EPUB-FINAL-TARGET';
const after = 'RR4EPUBFINALTARGET';

for (const file of files) {
  const content = await readFile(file, 'utf8');
  const count = content.split(before).length - 1;
  if (count < 1) throw new Error(`${file}: expected at least one EPUB sentinel.`);
  await writeFile(file, content.replaceAll(before, after), 'utf8');
}

await rm('scripts/rr4-search-token-fix.mjs', { force: true });
console.log('RR4_EPUB_SEARCH_SENTINEL_REPAIRED');
