import { readFile, rm, writeFile } from 'node:fs/promises';

const file = 'tests/performance/rr4-performance.spec.ts';
let content = await readFile(file, 'utf8');

function replaceOnce(before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}.`);
  content = content.replace(before, after);
}

replaceOnce(
`async function readerProgressFingerprint(page: Page): Promise<string> {
  return page.locator('[data-reader-progress-ux]').evaluate((element) => [
    element.getAttribute('style') ?? '',
    element.getAttribute('data-progress-stage') ?? '',
    element.querySelector('[data-reader-chapter]')?.textContent ?? '',
    element.querySelector('[data-reader-progress]')?.textContent ?? '',
  ].join('|'));
}`,
`async function readerLocationCfi(page: Page): Promise<string> {
  return page.locator('[data-reader-shell]').getAttribute('data-reader-location-cfi').then((value) => value ?? '');
}`,
  'EPUB exact-location helper',
);

replaceOnce(
`async function epubPageTurn(page: Page): Promise<number> {
  const next = page.locator('[data-reader-command="next"]');
  await expect(next).toBeEnabled();
  const before = await readerProgressFingerprint(page);
  return measureMs(page, async () => {
    await next.click();
    await expect.poll(() => readerProgressFingerprint(page)).not.toBe(before);
  });
}`,
`async function epubPageTurn(page: Page): Promise<number> {
  const next = page.locator('[data-reader-command="next"]');
  await expect(next).toBeEnabled();
  const before = await readerLocationCfi(page);
  expect(before).not.toBe('');
  return measureMs(page, async () => {
    await next.click();
    await expect.poll(() => readerLocationCfi(page)).not.toBe(before);
  });
}`,
  'EPUB page-turn relocation probe',
);

replaceOnce(
`  const fingerprint = await readerProgressFingerprint(page);
  await goToSaved(page);
  metrics.epubResumeReady = await openFixture(page, 'RR4 Large EPUB', 'epub');
  budget('epubResumeReady', metrics.epubResumeReady as number, budgets.budgetsMs.resumeReady!);
  await expect.poll(() => readerProgressFingerprint(page)).toBe(fingerprint);`,
`  const savedCfi = await readerLocationCfi(page);
  expect(savedCfi).not.toBe('');
  await goToSaved(page);
  metrics.epubResumeReady = await openFixture(page, 'RR4 Large EPUB', 'epub');
  budget('epubResumeReady', metrics.epubResumeReady as number, budgets.budgetsMs.resumeReady!);
  await expect.poll(() => readerLocationCfi(page)).toBe(savedCfi);`,
  'EPUB exact resume probe',
);

await writeFile(file, content, 'utf8');
await rm('scripts/rr4-location-evidence-fix.mjs', { force: true });
console.log('RR4_LOCATION_EVIDENCE_FIXED');
