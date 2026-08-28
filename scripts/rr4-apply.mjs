import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

async function write(relative, content) {
  await writeFile(path.join(root, relative), content, 'utf8');
}

function replaceOnce(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}.`);
  return content.replace(before, after);
}

// EPUB search cancellation: closing a long search must stop work immediately.
{
  const file = 'src/lib/reader/search.ts';
  let content = await read(file);
  content = replaceOnce(content,
`  close(returnFocus = true): void {
    if (this.destroyed || this.ui.panel.hidden) return;
    this.ui.panel.hidden = true;
    this.ui.button.setAttribute('aria-expanded', 'false');
    this.patchState({ open: false });
    if (returnFocus) this.ui.button.focus({ preventScroll: true });
  }`,
`  close(returnFocus = true): void {
    if (this.destroyed || this.ui.panel.hidden) return;
    if (this.state.status === 'searching') {
      this.abortController?.abort();
      this.abortController = undefined;
      this.revision += 1;
      this.patchState({ status: 'idle', message: 'Search cancelled.' });
    }
    this.ui.panel.hidden = true;
    this.ui.button.setAttribute('aria-expanded', 'false');
    this.patchState({ open: false });
    if (returnFocus) this.ui.button.focus({ preventScroll: true });
  }`,
    'EPUB search close cancellation');
  await write(file, content);
}

// PDF rendering/search lifecycle: stale page renders and closed searches must release work.
{
  const file = 'src/lib/pdf-reader/runtime.ts';
  let content = await read(file);
  content = replaceOnce(content,
`function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The PDF could not be opened in the integrated reader.';
}
`,
`function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The PDF could not be opened in the integrated reader.';
}

function isRenderingCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}
`,
    'PDF cancellation classifier');

  content = replaceOnce(content,
`  private openGeneration = 0;
  private destroyed = false;`,
`  private openGeneration = 0;
  private renderGeneration = 0;
  private destroyed = false;`,
    'PDF render generation field');

  const renderStart = content.indexOf('  private async renderCurrentPage() {');
  const renderEnd = content.indexOf('  private async goToPage(page: number) {', renderStart);
  if (renderStart < 0 || renderEnd < 0) throw new Error('PDF render method boundaries were not found.');
  const replacement = `  private async renderCurrentPage() {
    const pdf = this.document;
    if (!pdf || this.destroyed) return;
    const requestedPage = Math.min(this.pageCount, Math.max(1, this.page));
    const generation = ++this.renderGeneration;
    this.root.dataset.pdfRenderGeneration = String(generation);
    this.page = requestedPage;
    this.showBusy(\`Rendering page \${requestedPage}…\`);
    this.renderTask?.cancel();
    this.textLayer?.cancel();
    let page: PDFPageProxy | undefined;

    try {
      page = await pdf.getPage(requestedPage);
      if (this.destroyed || generation !== this.renderGeneration || requestedPage !== this.page) return;
      const viewport = this.viewportForPage(page);
      await this.renderPage(page, viewport, generation);
      if (this.destroyed || generation !== this.renderGeneration || requestedPage !== this.page) return;

      this.elements.pageInput.value = String(requestedPage);
      this.elements.previous.disabled = requestedPage <= 1;
      this.elements.next.disabled = requestedPage >= this.pageCount;
      this.furthestPage = Math.max(this.furthestPage, requestedPage);
      this.elements.progress.textContent = \`\${Math.round((requestedPage / this.pageCount) * 100)}% · furthest \${Math.round((this.furthestPage / this.pageCount) * 100)}%\`;
      this.elements.zoomLabel.textContent = \`\${Math.round(viewport.scale * 100)}%\`;
      this.elements.status.textContent = \`Page \${requestedPage} of \${this.pageCount}\`;
      this.elements.status.hidden = false;
      this.updateBookmarkButton();
      this.highlightSearchMatches();

      try {
        const progress = await setPdfProgress(this.candidate.identity, requestedPage, this.pageCount);
        if (this.destroyed || generation !== this.renderGeneration || requestedPage !== this.page) return;
        this.furthestPage = progress.furthestPage;
        this.elements.progress.textContent = \`\${Math.round((requestedPage / this.pageCount) * 100)}% · furthest \${Math.round((this.furthestPage / this.pageCount) * 100)}%\`;
      } catch {
        this.root.dataset.pdfPersistence = 'session-only';
      }
    } catch (error) {
      if (this.destroyed || generation !== this.renderGeneration || isRenderingCancellation(error)) return;
      throw error;
    } finally {
      try { page?.cleanup(); } catch {}
    }
  }

  private viewportForPage(page: PDFPageProxy) {
    const base = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(240, this.elements.viewport.clientWidth - 32);
    const availableHeight = Math.max(240, this.elements.viewport.clientHeight - 32);
    let scale = this.settings.zoom;
    if (this.settings.fit === 'width') scale = availableWidth / base.width;
    if (this.settings.fit === 'page') scale = Math.min(availableWidth / base.width, availableHeight / base.height);
    scale = clampZoom(scale);
    return page.getViewport({ scale });
  }

  private async renderPage(
    page: PDFPageProxy,
    viewport: ReturnType<PDFPageProxy['getViewport']>,
    generation: number,
  ) {
    const canvas = this.elements.canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = \`\${viewport.width}px\`;
    canvas.style.height = \`\${viewport.height}px\`;
    this.elements.textLayer.style.width = \`\${viewport.width}px\`;
    this.elements.textLayer.style.height = \`\${viewport.height}px\`;
    this.elements.textLayer.style.setProperty('--scale-factor', String(viewport.scale));

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    this.renderTask = renderTask;
    try {
      await renderTask.promise;
    } finally {
      if (this.renderTask === renderTask) delete this.renderTask;
    }
    if (this.destroyed || generation !== this.renderGeneration) return;

    this.elements.textLayer.replaceChildren();
    const textContent = await page.getTextContent();
    if (this.destroyed || generation !== this.renderGeneration) return;
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container: this.elements.textLayer,
      viewport,
    });
    this.textLayer = textLayer;
    try {
      await textLayer.render();
    } finally {
      if (this.textLayer === textLayer) delete this.textLayer;
    }
  }

`;
  content = content.slice(0, renderStart) + replacement + content.slice(renderEnd);

  content = replaceOnce(content,
`  private closeSearch() {
    if (this.elements.searchPanel.hidden) return;
    this.setPanel(null);
    this.elements.searchToggle.focus();
  }`,
`  private closeSearch() {
    if (this.elements.searchPanel.hidden) return;
    this.cancelSearch('Search cancelled.');
    this.setPanel(null);
    this.elements.searchToggle.focus();
  }`,
    'PDF search close cancellation');

  content = replaceOnce(content,
`  private closeActivePanel() {
    if (!this.elements.searchPanel.hidden) this.closeSearch();
    else if (!this.elements.bookmarkPanel.hidden) this.closeBookmarks();
  }

  private async search(rawQuery: string) {`,
`  private closeActivePanel() {
    if (!this.elements.searchPanel.hidden) this.closeSearch();
    else if (!this.elements.bookmarkPanel.hidden) this.closeBookmarks();
  }

  private cancelSearch(message?: string) {
    this.searchAbort?.abort();
    delete this.searchAbort;
    this.elements.searchSubmit.disabled = false;
    if (message) this.elements.searchStatus.textContent = message;
  }

  private async search(rawQuery: string) {`,
    'PDF search cancellation helper');

  content = replaceOnce(content,
`  private async search(rawQuery: string) {
    const pdf = this.document;
    const query = rawQuery.trim();
    if (!pdf || !query) {`,
`  private async search(rawQuery: string) {
    const pdf = this.document;
    const query = rawQuery.trim();
    this.cancelSearch();
    if (!pdf || !query) {`,
    'PDF search replacement cancellation');

  content = replaceOnce(content,
`    this.searchAbort?.abort();
    const controller = new AbortController();`,
`    const controller = new AbortController();`,
    'PDF duplicate search abort removal');

  const loopBefore = `        const page = await pdf.getPage(pageNumber);
        const text = await page.getTextContent();
        const plain = text.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\\s+/g, ' ')
          .trim();
        const normalized = normalizeSearch(plain);
        const index = normalized.indexOf(normalizedQuery);
        if (index >= 0) {
          const start = Math.max(0, index - 55);
          const end = Math.min(plain.length, index + query.length + 90);
          this.searchResults.push({
            page: pageNumber,
            snippet: \`\${start > 0 ? '…' : ''}\${plain.slice(start, end)}\${end < plain.length ? '…' : ''}\`,
          });
          if (this.searchResults.length >= MAX_SEARCH_RESULTS) break;
        }`;
  const loopAfter = `        const page = await pdf.getPage(pageNumber);
        try {
          const text = await page.getTextContent();
          if (controller.signal.aborted) return;
          const plain = text.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\\s+/g, ' ')
            .trim();
          const normalized = normalizeSearch(plain);
          const index = normalized.indexOf(normalizedQuery);
          if (index >= 0) {
            const start = Math.max(0, index - 55);
            const end = Math.min(plain.length, index + query.length + 90);
            this.searchResults.push({
              page: pageNumber,
              snippet: \`\${start > 0 ? '…' : ''}\${plain.slice(start, end)}\${end < plain.length ? '…' : ''}\`,
            });
            if (this.searchResults.length >= MAX_SEARCH_RESULTS) break;
          }
        } finally {
          try { page.cleanup(); } catch {}
        }`;
  content = replaceOnce(content, loopBefore, loopAfter, 'PDF search page cleanup');

  content = replaceOnce(content,
`  private async resetDocument() {
    this.renderTask?.cancel();`,
`  private async resetDocument() {
    this.renderGeneration += 1;
    this.renderTask?.cancel();`,
    'PDF reset generation invalidation');

  content = replaceOnce(content,
`    this.searchAbort?.abort();
    delete this.searchAbort;`,
`    this.cancelSearch();`,
    'PDF reset search cancellation');

  await write(file, content);
}

// Package commands and permanent source/release ownership.
{
  const file = 'package.json';
  const pkg = JSON.parse(await read(file));
  pkg.scripts['test:performance'] = 'playwright test --config=playwright.performance.config.ts';
  pkg.scripts['certify:performance'] = 'node scripts/certification/performance-budget.mjs';
  const before = 'node scripts/certification/publication-corpus.mjs && node scripts/certification/release-contract.mjs';
  const after = 'node scripts/certification/publication-corpus.mjs && node scripts/certification/performance-budget.mjs && node scripts/certification/release-contract.mjs';
  if (!pkg.scripts['certify:source'].includes(before)) throw new Error('package.json RR3 certification anchor is missing.');
  pkg.scripts['certify:source'] = pkg.scripts['certify:source'].replace(before, after);
  await write(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

// Keep the preceding release-contract certificate aware of RR4 ordering.
{
  const file = 'scripts/certification/release-contract.mjs';
  let content = await read(file);
  content = replaceOnce(content,
`pkg.includes('reader-device-ux.mjs && node scripts/certification/publication-corpus.mjs && node scripts/certification/release-contract.mjs')`,
`pkg.includes('reader-device-ux.mjs && node scripts/certification/publication-corpus.mjs && node scripts/certification/performance-budget.mjs && node scripts/certification/release-contract.mjs')`,
    'Release contract RR4 chain');
  content = replaceOnce(content,
`'Release-contract certification remains after ER7 device-profile and RR3 publication-compatibility certification'`,
`'Release-contract certification remains after ER7 device-profile, RR3 publication compatibility, and RR4 performance-budget certification'`,
    'Release contract RR4 description');
  await write(file, content);
}

// Production must pass RR4 after the complete browser suite and before artifact upload.
{
  const file = '.github/workflows/deploy.yml';
  let content = await read(file);
  content = replaceOnce(content,
`    outputs:
      browser: \${{ steps.browser.outcome }}`,
`    outputs:
      browser: \${{ steps.browser.outcome }}
      performance: \${{ steps.performance.outcome }}`,
    'Deployment RR4 output');
  content = replaceOnce(content,
`      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5`,
`      - name: Run low-end performance and memory budgets
        id: performance
        run: pnpm test:performance

      - name: Upload failed production performance evidence
        if: failure() && steps.performance.outcome == 'failure'
        uses: actions/upload-artifact@v4
        with:
          name: production-performance-budget-\${{ github.run_id }}
          path: |
            playwright-performance-report
            test-results
          if-no-files-found: warn
          retention-days: 14

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5`,
    'Deployment RR4 gate');
  content = replaceOnce(content,
`          BROWSER_RESULT: \${{ needs.build.outputs.browser }}
          DEPLOY_RESULT:`,
`          BROWSER_RESULT: \${{ needs.build.outputs.browser }}
          PERFORMANCE_RESULT: \${{ needs.build.outputs.performance }}
          DEPLOY_RESULT:`,
    'Deployment RR4 report environment');
  content = replaceOnce(content,
`          | browser acceptance before artifact upload | \${BROWSER_RESULT:-not-run} |
          | GitHub Pages deployment |`,
`          | browser acceptance before artifact upload | \${BROWSER_RESULT:-not-run} |
          | RR4 performance and memory gate | \${PERFORMANCE_RESULT:-not-run} |
          | GitHub Pages deployment |`,
    'Deployment RR4 report row');
  await write(file, content);
}

await rm(path.join(root, 'scripts/rr4-apply.mjs'), { force: true });
await rm(path.join(root, '.github/workflows/rr4-apply.yml'), { force: true });
console.log('RR4_PATCH_APPLIED');
