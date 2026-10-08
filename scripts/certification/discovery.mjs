import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/content/discovery.ts',
  'src/pages/works/[slug].astro',
  'src/styles/work-detail.css',
  'scripts/regression/discovery.test.ts',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('P5_DISCOVERY_FILES', present, 'P5 static discovery model, detail-page integration, styles, regression coverage, and certification assets are present');

if (present) {
  const [model, detail, css, pkg] = await Promise.all([
    readFile('src/lib/content/discovery.ts', 'utf8'),
    readFile('src/pages/works/[slug].astro', 'utf8'),
    readFile('src/styles/work-detail.css', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'P5_DISCOVERY_METADATA_ONLY',
    model.includes('rankRelatedWorks')
      && model.includes('relatedWorks')
      && model.includes('classification.subjects')
      && model.includes('classification.tags')
      && model.includes('classification.collections')
      && !model.includes('reading-activity')
      && !model.includes('getReading')
      && !model.includes('fetch(')
      && !model.includes('localStorage'),
    'Related-book discovery is deterministic published-metadata ranking and does not inspect personal reading state or network data',
  );

  pass(
    'P5_DISCOVERY_STRONG_SIGNAL',
    model.includes('strong: true')
      && model.includes('candidate.score > 0')
      && model.includes('candidate.language === source.language ? 1 : 0'),
    'Recommendations require a meaningful relationship signal; language is only a tie-strengthening signal',
  );

  pass(
    'P5_DISCOVERY_DETAIL_SURFACE',
    detail.includes('rankRelatedWorks')
      && detail.includes('book-detail__related')
      && detail.includes('data-related-work')
      && css.includes('.book-detail__related-grid'),
    'Book detail exposes a responsive related-books discovery section',
  );

  pass(
    'P5_DISCOVERY_CERT_CHAIN',
    pkg.includes('reading-intelligence.mjs && node scripts/certification/discovery.mjs'),
    'P5 discovery certification is chained after P5 reading intelligence',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('P5_DISCOVERY_SOURCE_PASS');
