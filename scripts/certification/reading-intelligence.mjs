import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reading-activity/intelligence.ts',
  'src/lib/reading-activity/library-dom.ts',
  'scripts/regression/reading-intelligence.test.ts',
  'src/pages/saved.astro',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('P5_READING_INTELLIGENCE_FILES', present, 'P5 reading-intelligence model, UI integration, regression coverage, and certification assets are present');

if (present) {
  const [model, dom, saved, pkg] = await Promise.all([
    readFile('src/lib/reading-activity/intelligence.ts', 'utf8'),
    readFile('src/lib/reading-activity/library-dom.ts', 'utf8'),
    readFile('src/pages/saved.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'P5_READING_INTELLIGENCE_DERIVED_ONLY',
    model.includes('summarizeReadingIntelligence')
      && model.includes('rankPausedReading')
      && !model.includes('fetch(')
      && !model.includes('XMLHttpRequest')
      && !model.includes('localStorage')
      && !model.includes('sessionStorage'),
    'P5 derives intelligence from existing Library reading state and adds no network or parallel tracking store',
  );

  pass(
    'P5_READING_INTELLIGENCE_WINDOWS',
    model.includes('recentDays = 30')
      && model.includes('pausedAfterDays = 21')
      && model.includes("state.status !== 'in-progress'"),
    'Recent activity and paused-reading thresholds are explicit deterministic rules',
  );

  pass(
    'P5_READING_INTELLIGENCE_UI',
    dom.includes("button.dataset.readingFilter = 'paused'")
      && dom.includes('renderReadingIntelligence')
      && dom.includes('rankPausedReading')
      && dom.includes('data-reading-resurface-list'),
    'My Library exposes a Paused smart filter and bounded local resurfacing view',
  );

  pass(
    'P5_READING_INTELLIGENCE_COPY',
    saved.includes('Filter My Library by reading status')
      && dom.includes('On-device reading activity only'),
    'P5 keeps reading-intelligence UI scoped to My Library and explicitly describes its local-only source',
  );

  pass(
    'P5_READING_INTELLIGENCE_CERT_CHAIN',
    pkg.includes('reading-activity.mjs && node scripts/certification/reading-intelligence.mjs'),
    'P5 source certification is permanently chained after the existing reading-activity certification',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('P5_READING_INTELLIGENCE_SOURCE_PASS');
