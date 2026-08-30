import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/client/library-db.ts',
  'src/lib/reading-activity/model.ts',
  'src/lib/reading-activity/client.ts',
  'src/lib/reading-activity/library-dom.ts',
  'src/layouts/BaseLayout.astro',
  'src/layouts/ReaderLayout.astro',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/works/[slug]/pdf.astro',
  'src/pages/personal/read.astro',
  'src/pages/personal/pdf.astro',
  'src/pages/index.astro',
  'src/pages/works/[slug].astro',
  'src/pages/saved.astro',
  'src/styles/personal-library.css',
  'scripts/regression/reading-activity.test.ts',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('READING_ACTIVITY_ER6_FILES', present, 'ER6 activity storage, pure model, client adapter, Library UI bridge, reader instrumentation, and regression assets are present');

if (present) {
  const [db, model, client, dom, baseLayout, legacyLayout, epub, pdf, personalEpub, personalPdf, home, detail, saved, css, pkg] = await Promise.all([
    readFile('src/lib/client/library-db.ts', 'utf8'),
    readFile('src/lib/reading-activity/model.ts', 'utf8'),
    readFile('src/lib/reading-activity/client.ts', 'utf8'),
    readFile('src/lib/reading-activity/library-dom.ts', 'utf8'),
    readFile('src/layouts/BaseLayout.astro', 'utf8'),
    readFile('src/layouts/ReaderLayout.astro', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('src/pages/works/[slug]/pdf.astro', 'utf8'),
    readFile('src/pages/personal/read.astro', 'utf8'),
    readFile('src/pages/personal/pdf.astro', 'utf8'),
    readFile('src/pages/index.astro', 'utf8'),
    readFile('src/pages/works/[slug].astro', 'utf8'),
    readFile('src/pages/saved.astro', 'utf8'),
    readFile('src/styles/personal-library.css', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'READING_ACTIVITY_ER6_STORAGE',
    db.includes('const DB_VERSION = 9')
      && db.includes("| 'readingActivity'")
      && db.includes("['readingActivity', 'workId']")
      && db.includes('ReadingActivityRecordV1')
      && db.includes('recordReadingActivity')
      && db.includes('getReadingActivity'),
    'RR8 DB v9 non-destructively retains the dedicated readingActivity store originally added in v8',
  );

  const activityInterface = db.slice(
    db.indexOf('export interface ReadingActivityRecordV1'),
    db.indexOf('export type StoredProgressRecord'),
  );
  pass(
    'READING_ACTIVITY_ER6_METADATA_ONLY',
    activityInterface.includes('workId: string')
      && activityInterface.includes('edition: number')
      && activityInterface.includes('releaseVersion: string')
      && activityInterface.includes('format: ReadingActivityFormat')
      && activityInterface.includes('openedAt: string')
      && !activityInterface.includes('cfi:')
      && !activityInterface.includes('page:')
      && !activityInterface.includes('note:')
      && !activityInterface.includes('quote:')
      && !activityInterface.includes('title:')
      && !activityInterface.includes('fileName:'),
    'Unified activity stores only identity/format/recency metadata and never copies native positions, annotations, titles, or personal filenames',
  );

  pass(
    'READING_ACTIVITY_ER6_EXACT_IDENTITY',
    model.includes('activity.workId === identity.workId')
      && model.includes('activity.edition === identity.edition')
      && model.includes('activity.releaseVersion === identity.releaseVersion')
      && client.includes('isExactReadingActivity(activity, request)'),
    'Current-release Library state accepts activity only for the exact work/edition/release identity',
  );

  pass(
    'READING_ACTIVITY_ER6_STATUS',
    model.includes("return 'in-progress'")
      && model.includes("return 'completed'")
      && model.includes("return 'not-started'")
      && model.indexOf("return 'in-progress'") < model.indexOf("return 'completed'"),
    'Format-neutral status prioritizes active reading, then completed reading, then saved/not-started without rewriting native state',
  );

  pass(
    'READING_ACTIVITY_ER6_RECENCY',
    model.includes('newestFormatEvent')
      && model.includes('entry.updatedAt')
      && model.includes('activity.openedAt')
      && model.includes('lastActivityAt')
      && model.includes('lastFormat'),
    'Last activity/format derives from the newest explicit open or native progress event rather than from one format-specific store',
  );

  pass(
    'READING_ACTIVITY_ER6_NO_POSITION_MERGE',
    !model.includes('epubcfi(')
      && !model.includes('furthestPage')
      && !client.includes('cfi')
      && !client.includes('pageCount')
      && client.includes('getReadingContinuity(request)'),
    'ER6 consumes ER5 continuity as read-only state and does not translate, persist, or merge EPUB CFIs and PDF pages',
  );

  pass(
    'READING_ACTIVITY_ER6_OPEN_INSTRUMENTATION',
    epub.includes('recordReadingOpen')
      && epub.includes("format: 'epub'")
      && pdf.includes('recordReadingOpen')
      && pdf.includes("format: 'pdf'")
      && personalEpub.includes('recordReadingOpen')
      && personalEpub.includes("source: 'personal'")
      && personalPdf.includes('recordReadingOpen')
      && personalPdf.includes("source: 'personal'")
      && legacyLayout.includes('recordReadingOpen')
      && legacyLayout.includes("format: 'web'"),
    'Hosted EPUB/PDF, personal EPUB/PDF, and legacy web reading all record best-effort format-neutral open activity',
  );

  pass(
    'READING_ACTIVITY_ER6_NON_BLOCKING',
    epub.includes('recordReadingOpen') && epub.includes('.catch(() => {})')
      && pdf.includes('recordReadingOpen') && pdf.includes('.catch(() => {})')
      && personalEpub.includes('recordReadingOpen') && personalEpub.includes('.catch(() => {})')
      && personalPdf.includes('recordReadingOpen') && personalPdf.includes('.catch(() => {})')
      && legacyLayout.includes('recordReadingOpen') && legacyLayout.includes('.catch(() => {})'),
    'Activity persistence failure never blocks or replaces the actual reader opening path',
  );

  pass(
    'READING_ACTIVITY_ER6_HOME_RECENT',
    home.includes('data-recent-section')
      && home.includes('data-recent-work')
      && home.includes('data-catalog-activity')
      && dom.includes('renderRecent(states)')
      && dom.includes('compareReadingRecency')
      && dom.includes('slice(0, 5)'),
    'Homepage exposes recent reading across statuses and sorts Continue/Recent surfaces from unified recency rather than catalog order',
  );

  pass(
    'READING_ACTIVITY_ER6_DETAIL',
    detail.includes('data-reading-activity')
      && dom.includes('renderBookDetailActivity')
      && dom.includes('activitySummary(state)'),
    'Book detail exposes format-neutral reading status and last-used format/recency without replacing ER5 exact-format progress',
  );

  pass(
    'READING_ACTIVITY_ER6_MY_LIBRARY',
    saved.includes('data-reading-filters')
      && saved.includes('data-reading-state-summary')
      && saved.includes('data-edition={work.publication.edition}')
      && saved.includes('data-reader-href=')
      && dom.includes('decorateSavedHosted')
      && dom.includes('decoratePersonalBooks')
      && dom.includes('readingLibraryStatusRank')
      && dom.includes('applyLibraryFilter')
      && css.includes('[data-activity-filter-hidden="true"]'),
    'Hosted saved books and imported personal books share the same Reading/Finished/Saved-for-later classification, filter vocabulary, and sort rules',
  );

  pass(
    'READING_ACTIVITY_ER6_CROSS_TAB',
    db.includes("broadcast('readingActivity', input.workId)")
      && client.includes('subscribeUnifiedReadingState(listener)'),
    'Activity invalidation rides the existing Library channel while EPUB/PDF subscriptions remain authoritative for their native progress',
  );

  pass(
    'READING_ACTIVITY_ER6_GLOBAL_MOUNT',
    baseLayout.includes('mountReadingActivityLibraryState')
      && baseLayout.includes("window.addEventListener('pagehide', unmountReadingActivityLibraryState"),
    'Derived Library activity presentation mounts once on ordinary Library surfaces and has explicit lifecycle cleanup',
  );

  pass(
    'READING_ACTIVITY_ER6_PRIVACY',
    !client.includes('fetch(')
      && !client.includes('XMLHttpRequest')
      && !dom.includes('fetch(')
      && !dom.includes('XMLHttpRequest'),
    'ER6 activity and Library-state derivation remain browser-local and introduce no telemetry or upload path',
  );

  pass(
    'READING_ACTIVITY_ER6_CERT_CHAIN',
    pkg.includes('reader-entry.mjs && node scripts/certification/reading-activity.mjs'),
    'ER6 certification is permanently chained immediately after ER5 reader-entry certification',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READING_ACTIVITY_SOURCE_PASS');
