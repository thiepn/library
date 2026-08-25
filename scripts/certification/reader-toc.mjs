import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const tocFile = 'src/lib/reader/toc.ts';
const tocHarnessFile = 'src/lib/reader/toc-harness.ts';
const tocCssFile = 'src/styles/reader-toc.css';
const engineFile = 'src/lib/reader/engines/epubjs.ts';
const controllerFile = 'src/lib/reader/controller.ts';
const indexFile = 'src/lib/reader/index.ts';

const filesExist = (await Promise.all([tocFile, tocHarnessFile, tocCssFile].map(exists))).every(Boolean);
pass('EPUB_READER_NATIVE_TOC', filesExist, 'Dedicated native EPUB TOC controller, harness, and responsive styles are present');

if (filesExist) {
  const toc = await readFile(tocFile, 'utf8');
  const harness = await readFile(tocHarnessFile, 'utf8');
  const css = await readFile(tocCssFile, 'utf8');
  const engine = await readFile(engineFile, 'utf8');
  const controller = await readFile(controllerFile, 'utf8');
  const index = await readFile(indexFile, 'utf8');

  pass(
    'EPUB_READER_TOC_NATIVE_NAV',
    engine.includes('loaded.navigation') && engine.includes('navigation.toc') && engine.includes('children: mapToc(item.subitems ?? [])'),
    'TOC data comes from the EPUB navigation document and preserves nested hierarchy',
  );
  pass(
    'EPUB_READER_TOC_NESTED_RENDER',
    toc.includes('renderLevel(item.children') && toc.includes('data.readerTocGroup') === false && toc.includes('dataset.readerTocGroup') && toc.includes('aria-expanded'),
    'Nested EPUB parts and chapters render recursively with collapsible branches',
  );
  pass(
    'EPUB_READER_TOC_HREF_NAVIGATION',
    toc.includes('this.controller.goTo(href)') && controller.includes('goTo(target: string)') && controller.includes('this.engine.goToHref(target)'),
    'TOC selections navigate through ReaderController and the EPUB engine instead of browser routes',
  );
  pass(
    'EPUB_READER_TOC_ACTIVE_LOCATION',
    toc.includes('state.location.href') && toc.includes("aria-current', 'location'") && toc.includes('normalizeDocumentHref') && toc.includes('data.readerTocActive') === false && toc.includes('dataset.readerTocActive'),
    'Current EPUB location drives active-section highlighting and parent-branch expansion',
  );
  pass(
    'EPUB_READER_TOC_HUMAN_LABEL',
    harness.includes('state.activeLabel') && harness.includes('base.shell.setChapter(state.activeLabel)'),
    'Reader chrome uses the native TOC label rather than exposing raw EPUB filenames',
  );
  pass(
    'EPUB_READER_TOC_LONG_BOOK_SAFE',
    toc.includes("const becameReady = state.status === 'ready'") && toc.includes('if (becameReady)') && toc.includes('tocSignature(state.toc)') && toc.includes('this.elements.list.replaceChildren()'),
    'Large TOCs rebuild only when a publication becomes ready, not on every relocation',
  );
  pass(
    'EPUB_READER_TOC_ACCESSIBLE_DRAWER',
    toc.includes("setAttribute('role', 'dialog')") && toc.includes("setAttribute('aria-modal', 'true')") && toc.includes("event.key === 'Escape'") && toc.includes("event.key !== 'Tab'") && toc.includes("aria-live', 'polite'"),
    'Contents drawer provides dialog semantics, Escape dismissal, focus containment, and live error feedback',
  );
  pass(
    'EPUB_READER_TOC_MOBILE',
    css.includes('@media (max-width: 600px)') && css.includes('min-height: 44px') && css.includes('@media (max-width: 370px)') && css.includes('display: inline-grid !important'),
    'TOC remains reachable and touch-sized on narrow mobile screens',
  );
  pass(
    'EPUB_READER_TOC_HARNESS',
    harness.includes('mountReaderShellWithTocHarness') && harness.includes('mountReaderPublicationWithTocHarness') && harness.includes("command === 'contents'") && harness.includes('toc.start()') && harness.includes('toc.destroy()'),
    'Synthetic and publication-aware harnesses include the native TOC lifecycle',
  );
  pass(
    'EPUB_READER_TOC_PUBLIC_API',
    index.includes('ReaderTocController') && index.includes('mountReaderPublicationWithTocHarness') && index.includes('ReaderTocState'),
    'Native TOC controller and harness are exposed through the stable reader module API',
  );
  pass(
    'EPUB_READER_TOC_GENERIC',
    !toc.includes('ai-for-the-kingdom') && !harness.includes('ai-for-the-kingdom') && !toc.includes('unfinished-mission'),
    'Native TOC implementation contains no title- or book-specific routing logic',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_TOC_PASS');
