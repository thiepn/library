import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/pages/index.astro',
  'src/styles/library-home.css',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('LIBRARY_HOME_P17', present, 'P17 publication-aware Library homepage and responsive styles are present');

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
    'Homepage format badges are derived from validated active-release artifacts rather than intended format flags',
  );

  pass(
    'LIBRARY_HOME_READER_ROUTE_SAFE',
    page.includes('const readHref = work.webMaterialized')
      && page.includes("data-web-readable={readHref ? 'true' : 'false'}")
      && page.includes('data-catalog-reader-cta'),
    'Public web-reader actions remain gated by materialized legacy-reader availability during staged EPUB rollout',
  );

  pass(
    'LIBRARY_HOME_INTELLIGENT_CTA',
    page.includes('getProgress')
      && page.includes("legacy.percent >= 99 ? 'Read again' : 'Continue reading'")
      && page.includes("'Start reading'"),
    'Compatible public web-reader cards distinguish start, continue, and reread states from legacy progress',
  );

  pass(
    'LIBRARY_HOME_NATIVE_PROGRESS_RELEASE_BOUND',
    page.includes('getReaderProgress')
      && page.includes('native.edition === edition')
      && page.includes('native.releaseVersion === releaseVersion')
      && page.includes('furthestPercentage'),
    'Native EPUB progress appears only when edition and releaseVersion exactly match the catalog publication',
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
      && page.includes("card.dataset.saved = String(saved)"),
    'Homepage cards react to Library saved state and support direct accessible save/un-save actions',
  );

  pass(
    'LIBRARY_HOME_CONTINUE_SECTION',
    page.includes('data-continue-section')
      && page.includes('renderContinue')
      && page.includes('legacy.percent > 0 && legacy.percent < 99.5')
      && page.includes('matchingNative.percentage > 0 && matchingNative.percentage < .995'),
    'Continue-reading section is driven by actual stored reading state rather than a server-only list of Markdown-readable works',
  );

  pass(
    'LIBRARY_HOME_PUBLICATION_METADATA',
    page.includes('work.publication.editionLabel')
      && page.includes('Release ${release.version}')
      && page.includes('Available formats')
      && page.includes('Details only'),
    'Catalog cards communicate edition, active release identity, and actual available formats',
  );

  pass(
    'LIBRARY_HOME_NO_RESTORATION_ASSUMPTIONS',
    !page.includes('restoring')
      && !page.includes('Edition restoration')
      && !page.includes("work.id === 'ai-for-the-kingdom'"),
    'Homepage contains no legacy restoration copy or title-specific publication exceptions',
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
    'Publication cards, search, progress, and continue-reading layout adapt across desktop, tablet, phone, and forced-colors modes',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('LIBRARY_HOME_SOURCE_PASS');
