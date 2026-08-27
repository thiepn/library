import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/pages/index.astro',
  'src/styles/library-home.css',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('LIBRARY_HOME_P17', present, 'Reader-first Library homepage and responsive styles are present');

if (present) {
  const page = await readFile('src/pages/index.astro', 'utf8');
  const css = await readFile('src/styles/library-home.css', 'utf8');

  pass(
    'LIBRARY_HOME_RELEASE_FORMATS',
    page.includes('const release = work.release')
      && page.includes('release?.artifacts.pdf')
      && page.includes('release?.artifacts.epub')
      && !page.includes("work.formats.pdf.enabled ? 'PDF'")
      && !page.includes("work.formats.epub.enabled ? 'EPUB'"),
    'Reader format badges are derived from validated active-release artifacts rather than intended format flags',
  );

  pass(
    'LIBRARY_HOME_READER_ROUTE_SAFE',
    page.includes('const readHref = work.webMaterialized')
      && page.includes("data-web-readable={readHref ? 'true' : 'false'}")
      && page.includes('data-catalog-reader-cta'),
    'Reader actions remain gated by a materialized reading route during staged native-reader rollout',
  );

  pass(
    'LIBRARY_HOME_INTELLIGENT_CTA',
    page.includes('getProgress')
      && page.includes("legacy.percent >= 99 ? 'Read again' : 'Continue reading'")
      && page.includes("'Start reading'"),
    'Readable book cards distinguish start, continue, and reread states from stored progress',
  );

  pass(
    'LIBRARY_HOME_NATIVE_PROGRESS_RELEASE_BOUND',
    page.includes('getReaderProgress')
      && page.includes('native.edition === edition')
      && page.includes('native.releaseVersion === releaseVersion')
      && page.includes('furthestPercentage'),
    'Native EPUB progress appears only when edition and releaseVersion exactly match the catalog book',
  );

  pass(
    'LIBRARY_HOME_PROGRESS_VISUAL',
    page.includes('data-catalog-progress')
      && page.includes('data-catalog-progress-furthest')
      && css.includes('.catalog-progress__track'),
    'Catalog cards present current and furthest progress as distinct visual states',
  );

  pass(
    'LIBRARY_HOME_SAVED_INTEGRATION',
    page.includes('getFavoriteWorkIds')
      && page.includes('toggleFavorite')
      && page.includes('data-saved-badge')
      && page.includes("card.dataset.saved = String(saved)")
      && page.includes('Add to My Library'),
    'Homepage cards react to My Library state and support direct accessible save/un-save actions',
  );

  pass(
    'LIBRARY_HOME_CONTINUE_SECTION',
    page.includes('data-continue-section')
      && page.includes('renderContinue')
      && page.includes('legacy.percent > 0 && legacy.percent < 99.5')
      && page.includes('matchingNative.percentage > 0 && matchingNative.percentage < .995')
      && page.indexOf('data-continue-section') < page.indexOf('id="books"'),
    'Continue Reading is driven by stored state and appears before the full book catalog',
  );

  pass(
    'LIBRARY_HOME_READER_METADATA',
    page.includes("work.webMaterialized ? 'Reader' : null")
      && page.includes("epub ? 'EPUB' : null")
      && page.includes("pdf ? 'PDF' : null")
      && page.includes('Available reading formats')
      && !page.includes('Release ${release.version}')
      && !page.includes('No active binary release')
      && !page.includes('work.publication.editionLabel'),
    'Catalog exposes reader-facing format availability without internal release-engineering metadata',
  );

  pass(
    'LIBRARY_HOME_NO_RESTORATION_ASSUMPTIONS',
    !page.includes('restoring')
      && !page.includes('Edition restoration')
      && !page.includes("work.id === 'ai-for-the-kingdom'"),
    'Homepage contains no legacy restoration copy or title-specific book exceptions',
  );

  pass(
    'LIBRARY_HOME_STATE_SUBSCRIPTION',
    page.includes('subscribeLibraryState')
      && page.includes('renderLibraryState')
      && page.includes("window.addEventListener('pagehide', unsubscribe"),
    'Saved/progress catalog state reacts to cross-tab Library updates and cleans up its subscription',
  );

  pass(
    'LIBRARY_HOME_RESPONSIVE',
    css.includes('@media (max-width: 980px)')
      && css.includes('@media (max-width: 800px)')
      && css.includes('@media (max-width: 620px)')
      && css.includes('@media (max-width: 420px)')
      && css.includes('@media (forced-colors: active)'),
    'Book cards, search, progress, and continue-reading layout adapt across desktop, tablet, phone, and forced-colors modes',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('LIBRARY_HOME_SOURCE_PASS');
