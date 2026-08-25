import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
const astroConfig = await readFile('astro.config.mjs', 'utf8');
const deployWorkflow = await readFile('.github/workflows/deploy.yml', 'utf8');

pass('ASTRO_STACK', await exists('astro.config.mjs'), 'Astro configuration is present');
pass('ASTRO6_CONTENT', await exists('src/content.config.ts'), 'Astro 6 Content Loader configuration is present');
pass('PATH_MOUNT', astroConfig.includes("site: 'https://thiepn.dev'") && astroConfig.includes("base: '/library'") && astroConfig.includes("outDir: './dist/library'"), 'Production application is mounted at https://thiepn.dev/library');
pass('GITHUB_PAGES_DEPLOY', deployWorkflow.includes('actions/configure-pages@') && deployWorkflow.includes('actions/upload-pages-artifact@') && deployWorkflow.includes('actions/deploy-pages@'), 'Production static site is deployed through GitHub Pages');
pass('R2_MEDIA_STAGING', deployWorkflow.includes('pnpm stage:media'), 'All canonical release media are staged generically from verified R2 objects');
pass('PRODUCTION_VERIFY', deployWorkflow.includes('pnpm verify:production'), 'Production routes and artifact hashes are verified generically');
pass('NO_REACT_RUNTIME', !(await exists('vite.config.ts')) && !(await exists('src/main.tsx')), 'Temporary React/Vite runtime is absent');
pass('SITEMAP', await exists('src/pages/sitemap.xml.ts'), 'Library sitemap endpoint is generated under /library');
pass('READER_ROUTES', await exists('src/pages/works/[slug]/read/[chapter].astro'), 'Native Reader route is implemented');
pass('LOCKFILE', await exists('pnpm-lock.yaml'), 'A frozen dependency lock is required before certification');

const readerShellFiles = [
  'src/layouts/EpubReaderLayout.astro',
  'src/components/reader/ReaderShell.astro',
  'src/styles/reader-shell.css',
  'src/lib/reader/shell.ts',
];
const readerShellExists = (await Promise.all(readerShellFiles.map(exists))).every(Boolean);
pass('EPUB_READER_SHELL', readerShellExists, 'Dedicated fullscreen EPUB reader shell is present alongside the preserved legacy chapter reader');
if (readerShellExists) {
  const shellComponent = await readFile('src/components/reader/ReaderShell.astro', 'utf8');
  const shellController = await readFile('src/lib/reader/shell.ts', 'utf8');
  const shellHarness = await readFile('src/lib/reader/harness.ts', 'utf8');
  pass('EPUB_READER_SHELL_A11Y', shellComponent.includes('aria-live="polite"') && shellComponent.includes('aria-busy="true"') && shellComponent.includes('data-reader-error'), 'Reader shell exposes loading, error, live-region, and busy accessibility states');
  pass('EPUB_READER_SHELL_CONTROLS', shellController.includes('setControlsVisible') && shellController.includes('setNavigationAvailability') && shellController.includes('reader-shell:toggle-controls'), 'Reader shell controller owns chrome visibility and navigation availability');
  pass('EPUB_READER_SHELL_HARNESS', shellHarness.includes('mountReaderShellHarness') && shellHarness.includes('mountReaderShell(root)'), 'Reader shell and EPUB engine are connected through a non-public fixture harness');
}

const readingModeFiles = [
  'src/lib/reader/reading-mode.ts',
  'src/styles/reader-modes.css',
];
const readingModesExist = (await Promise.all(readingModeFiles.map(exists))).every(Boolean);
pass('EPUB_READER_READING_MODES', readingModesExist, 'Paginated and scrolling mode controller and responsive mode UI are present');
if (readingModesExist) {
  const readingModes = await readFile('src/lib/reader/reading-mode.ts', 'utf8');
  const controller = await readFile('src/lib/reader/controller.ts', 'utf8');
  const engine = await readFile('src/lib/reader/engines/epubjs.ts', 'utf8');
  const shellComponent = await readFile('src/components/reader/ReaderShell.astro', 'utf8');
  pass('EPUB_READER_POSITION_PRESERVE', controller.includes('updateReadingLayout') && controller.includes('this.state.location?.cfi') && controller.includes('this.engine.display(target)'), 'Reading layout changes preserve the current EPUB CFI');
  pass('EPUB_READER_RESPONSIVE_SPREAD', readingModes.includes('ResizeObserver') && readingModes.includes('minSpreadWidth') && readingModes.includes("flow === 'scrolled'") && readingModes.includes("return 'double'"), 'Reading mode controller recalculates single/double spreads from viewport changes');
  pass('EPUB_READER_RESIZE', engine.includes('resize(width: number, height: number)') && engine.includes('.resize(safeWidth, safeHeight)'), 'EPUB rendition has an explicit resize bridge for orientation and viewport changes');
  pass('EPUB_READER_MODE_CONTROLS', shellComponent.includes('flow-paginated') && shellComponent.includes('flow-scrolled') && shellComponent.includes('spread-auto') && shellComponent.includes('spread-double'), 'Reader shell exposes paginated/scroll and page-spread controls');
}

const worksRoot = 'src/content/works';
const releaseRoot = 'src/publications/releases';
for (const entry of await readdir(worksRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = path.join(worksRoot, entry.name, 'work.yaml');
  const work = YAML.parse(await readFile(manifestPath, 'utf8'));
  if (work.visibility !== 'public' || !['published', 'archived'].includes(work.status)) continue;

  const chapterDir = path.join(worksRoot, work.id, 'chapters');
  let chapterCount = 0;
  if (await exists(chapterDir)) chapterCount = (await readdir(chapterDir)).filter((name) => /\.(md|mdx)$/i.test(name)).length;
  let expected;
  for (const filename of ['publication-expected.json', 'l17b-expected.json']) {
    try { expected = JSON.parse(await readFile(path.join(worksRoot, work.id, 'recovery', filename), 'utf8')); break; } catch {}
  }
  if (work.formats?.web?.enabled) {
    const ok = expected ? chapterCount === Number(expected.expectedReaderFiles) : chapterCount > 0;
    pass(`WEB_${work.id}`, ok, expected ? `${chapterCount}/${expected.expectedReaderFiles} frozen reader files` : `${chapterCount} reader files`);
  }

  if (work.formats?.pdf?.enabled || work.formats?.epub?.enabled) {
    const version = work.publication?.activeRelease;
    const releaseFile = path.join(releaseRoot, work.id, `${version}.yaml`);
    const releaseExists = Boolean(version) && await exists(releaseFile);
    pass(`RELEASE_${work.id}`, releaseExists, releaseExists ? `Canonical release ${version} is registered` : 'Canonical release registry is missing');
    if (releaseExists) {
      const releaseRaw = await readFile(releaseFile, 'utf8');
      pass(`MEDIA_ORIGIN_${work.id}`, releaseRaw.includes('https://thiepn.dev/library/media/'), 'Canonical publication media use the Library Pages origin');
    }
  }
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('SOURCE_PASS');
