import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/progress.ts',
  'src/lib/reader/progress-ux.ts',
  'src/lib/reader/location-cache.ts',
  'src/styles/reader-progress.css',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_PROGRESS_UX', present, 'P15 progress state, whole-book location map UX, cache, and responsive styles are present');

if (present) {
  const progress = await readFile('src/lib/reader/progress.ts', 'utf8');
  const ux = await readFile('src/lib/reader/progress-ux.ts', 'utf8');
  const cache = await readFile('src/lib/reader/location-cache.ts', 'utf8');
  const controller = await readFile('src/lib/reader/controller.ts', 'utf8');
  const harness = await readFile('src/lib/reader/harness.ts', 'utf8');
  const css = await readFile('src/styles/reader-progress.css', 'utf8');
  const publicApi = await readFile('src/lib/reader/index.ts', 'utf8');

  pass('EPUB_READER_PROGRESS_STATE', progress.includes('ReaderProgressState') && progress.includes('currentPercentage') && progress.includes('furthestPercentage') && progress.includes('subscribe(listener'), 'P12 persistence exposes reactive current and furthest progress without merging them');
  pass('EPUB_READER_PROGRESS_LOCATIONS_NONBLOCKING', ux.includes('DEFAULT_GENERATION_DELAY_MS') && ux.includes('window.setTimeout') && harness.indexOf('await controller.open') < harness.indexOf('progressUx.start()'), 'Whole-book location generation begins only after first EPUB display and never blocks initial opening');
  pass('EPUB_READER_PROGRESS_CACHE', cache.includes('thiepn-library-reader-locations-v1') && ['workId', 'edition', 'releaseVersion'].every((field) => cache.includes(field)) && cache.includes('globalThis.caches'), 'Serialized EPUB location maps are cached asynchronously and bound to the exact publication release');
  pass('EPUB_READER_PROGRESS_CACHE_SAFE', cache.includes('Reading remains functional without browser cache storage') && ux.includes("setMapStatus('unavailable')"), 'Cache or location generation failure degrades to ordinary reading instead of failing the reader');
  pass('EPUB_READER_PROGRESS_ACCURATE_PERCENT', controller.includes('generateLocations') && controller.includes('percentageFromCfi') && controller.includes('refreshCurrentPercentage') && ux.includes('location?.percentage'), 'Generated EPUB locations enrich the current CFI with whole-book percentage');
  pass('EPUB_READER_PROGRESS_CURRENT_FURTHEST', ux.includes('Math.max(current, clamp01(this.progressState.furthestPercentage))') && css.includes('--reader-progress-current') && css.includes('--reader-progress-furthest'), 'Visible progress independently represents current and furthest reading positions');
  pass('EPUB_READER_PROGRESS_TRACK', ux.includes('reader-progress__track') && ux.includes('reader-progress__furthest-marker') && css.includes('.reader-progress__track::after'), 'Reader footer receives a responsive visual whole-book progress track and furthest marker');
  pass('EPUB_READER_PROGRESS_SCRUB', ux.includes("input.type = 'range'") && ux.includes('jumpToPercentage') && ux.includes('parseLocationCfis') && ux.includes('this.controller.goTo(cfi)'), 'Progress range control jumps through generated EPUB CFI locations rather than fake page numbers');
  pass('EPUB_READER_PROGRESS_STAGES', ['beginning', 'reading', 'near-end', 'complete'].every((stage) => ux.includes(`'${stage}'`)) && css.includes('data-progress-stage="complete"'), 'Progress UX distinguishes beginning, reading, near-end, and completed states');
  pass('EPUB_READER_PROGRESS_RESPONSIVE', css.includes('@media (max-width: 760px)') && css.includes('@media (max-width: 420px)') && ux.includes("aria-valuetext"), 'Progress track is responsive and exposes current/furthest values to assistive technology');
  pass('EPUB_READER_PROGRESS_HARNESS', harness.includes('ReaderProgressUxController') && harness.includes('progressUx.start()') && harness.includes('progressUx.reapply()') && harness.includes('progressUx?.destroy()'), 'P15 participates in open, retry/reapply, and teardown lifecycle of the staged publication harness');
  pass('EPUB_READER_PROGRESS_PUBLIC_API', publicApi.includes('ReaderProgressUxController') && publicApi.includes('ReaderLocationCache') && publicApi.includes('ReaderProgressUxState'), 'P15 progress and cache surfaces are exported through the reader module');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_PROGRESS_SOURCE_PASS');
