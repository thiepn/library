import { readFile, rm, writeFile } from 'node:fs/promises';

function replaceOnce(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}.`);
  return content.replace(before, after);
}

{
  const file = 'tests/performance/rr4-performance.spec.ts';
  let content = await readFile(file, 'utf8');
  content = replaceOnce(
    content,
    "test('RR4 fixture classes remain deterministic and bounded', async (_fixtures, testInfo) => {",
    "test('RR4 fixture classes remain deterministic and bounded', async ({}, testInfo) => {",
    'Playwright fixture destructuring',
  );
  content = replaceOnce(
    content,
`  const elapsed = await measureMs(page, async () => {
    await page.locator('[data-personal-file-input]').setInputFiles(fixture);
    await expect(status).toContainText('1 imported');
  });
  await expect(titleCard(page, title)).toHaveCount(1);`,
`  const elapsed = await measureMs(page, async () => {
    await page.locator('[data-personal-file-input]').setInputFiles(fixture);
    await expect(status).toContainText('1 imported');
    await expect(titleCard(page, title)).toHaveCount(1);
  });`,
    'Import completion measurement',
  );
  await writeFile(file, content, 'utf8');
}

{
  const file = 'src/lib/pdf-reader/runtime.ts';
  let content = await readFile(file, 'utf8');
  content = replaceOnce(
    content,
`  private closeSearch() {
    if (this.elements.searchPanel.hidden) return;
    this.cancelSearch('Search cancelled.');
    this.setPanel(null);
    this.elements.searchToggle.focus();
  }`,
`  private closeSearch() {
    if (this.elements.searchPanel.hidden) return;
    const wasSearching = Boolean(this.searchAbort);
    this.cancelSearch(wasSearching ? 'Search cancelled.' : undefined);
    this.setPanel(null);
    this.elements.searchToggle.focus();
  }`,
    'PDF completed-search close state',
  );
  content = replaceOnce(
    content,
`    } finally {
      if (this.searchAbort === controller) this.elements.searchSubmit.disabled = false;
    }
  }

  private renderSearchResults() {`,
`    } finally {
      if (this.searchAbort === controller) {
        delete this.searchAbort;
        this.elements.searchSubmit.disabled = false;
      }
    }
  }

  private renderSearchResults() {`,
    'PDF search controller release',
  );
  await writeFile(file, content, 'utf8');
}

await rm('scripts/rr4-browser-fix.mjs', { force: true });
console.log('RR4_BROWSER_FIX_APPLIED');
