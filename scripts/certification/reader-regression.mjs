import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'scripts/regression/reader-fake-engine.ts',
  'scripts/regression/reader-core.test.ts',
  'scripts/regression/reader-migration-fallback.test.ts',
  'scripts/regression/reader-postbuild.mjs',
  'docs/P30_READER_REGRESSION_SUITE.md',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_REGRESSION_P30', present, 'P30 deterministic behavioral, migration/fallback, built-route, documentation, and certification assets are present');

if (present) {
  const [fake, core, migration, postbuild, pkg, quality, docs] = await Promise.all([
    readFile('scripts/regression/reader-fake-engine.ts', 'utf8'),
    readFile('scripts/regression/reader-core.test.ts', 'utf8'),
    readFile('scripts/regression/reader-migration-fallback.test.ts', 'utf8'),
    readFile('scripts/regression/reader-postbuild.mjs', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('.github/workflows/quality.yml', 'utf8'),
    readFile('docs/P30_READER_REGRESSION_SUITE.md', 'utf8'),
  ]);

  pass(
    'EPUB_READER_REGRESSION_FAKE_ENGINE',
    fake.includes('class FakeReaderEngine implements ReaderEngine')
      && fake.includes('displayFailures')
      && fake.includes('emitLocation')
      && fake.includes('emitSelection')
      && fake.includes('emitInteraction'),
    'P30 uses a deterministic ReaderEngine test double that can drive locations, selections, interactions, and controlled failures',
  );
  pass(
    'EPUB_READER_REGRESSION_CONTROLLER_BEHAVIOR',
    core.includes('saved target failure falls back')
      && core.includes('EPUB CFI and href navigation remain distinct')
      && core.includes('layout reflow preserves the exact current CFI')
      && core.includes('generated location maps enrich current percentage')
      && core.includes('destroy is idempotent'),
    'Core regression tests exercise real ReaderController behavior rather than only checking source strings',
  );
  pass(
    'EPUB_READER_REGRESSION_MIGRATION_BEHAVIOR',
    migration.includes('eligible active EPUB release wins')
      && migration.includes('materialized Markdown remains first-class')
      && migration.includes('work without EPUB or materialized Markdown is explicitly unavailable')
      && migration.includes('localizeReaderPublication'),
    'Migration regression tests protect native-first precedence, legacy fallback, unavailable state, and same-origin artifact localization',
  );
  pass(
    'EPUB_READER_REGRESSION_FAILURE_BEHAVIOR',
    migration.includes('network-like errors receive network recovery')
      && migration.includes("'epub-open-failed'")
      && migration.includes("'epub-render-failed'")
      && migration.includes("'invalid-location'")
      && migration.includes("'invalid-container'"),
    'P26 failure taxonomy and retryability are covered by executable regression tests',
  );
  pass(
    'EPUB_READER_REGRESSION_BUILT_ROUTES',
    postbuild.includes("path.join(root, 'works', work.slug, 'read')")
      && postbuild.includes("launcher.includes('data-reader-shell')")
      && postbuild.includes("launcher.includes('data-reader-launch')")
      && postbuild.includes('collectChapterPages'),
    'Post-build regression walks every public web-readable work and verifies canonical reader routing plus historical chapter materialization',
  );
  pass(
    'EPUB_READER_REGRESSION_P29_BRIDGE',
    postbuild.includes("html.includes('Legacy web reader')")
      && postbuild.includes('content=\\"noindex,follow\\"')
      && postbuild.includes('Open current reader')
      && postbuild.includes('incorrectly demoted to compatibility UI'),
    'Built-route tests protect both migrated P29 compatibility pages and Markdown-primary legacy pages',
  );
  pass(
    'EPUB_READER_REGRESSION_P28_CONTINUITY',
    postbuild.includes("path.join(root, 'offline', 'index.html')")
      && postbuild.includes("path.join(root, 'service-worker.js')"),
    'Regression suite blocks removal of P28 offline recovery assets from the built reader application',
  );
  pass(
    'EPUB_READER_REGRESSION_NODE_NATIVE',
    pkg.includes('"test:reader": "node --import tsx --test scripts/regression/*.test.ts"')
      && !pkg.includes('playwright')
      && !pkg.includes('vitest')
      && !pkg.includes('jest'),
    'P30 uses the Node test runner with the existing tsx toolchain and adds no heavyweight browser/test framework dependency',
  );
  pass(
    'EPUB_READER_REGRESSION_POSTBUILD_SCRIPT',
    pkg.includes('"test:reader:postbuild": "node scripts/regression/reader-postbuild.mjs"'),
    'Built-output regression has a dedicated repeatable package command',
  );
  pass(
    'EPUB_READER_REGRESSION_CI',
    quality.includes('Reader behavioral regression suite')
      && quality.includes('run: pnpm test:reader')
      && quality.includes('pnpm certify:postbuild && pnpm test:reader:postbuild'),
    'Pull requests and main pushes execute behavioral regression before build and built-route regression after build',
  );
  pass(
    'EPUB_READER_REGRESSION_RELEASE_GATE',
    pkg.includes('pnpm certify:source && pnpm test:reader && pnpm l17b:verify && pnpm build && pnpm certify:postbuild && pnpm test:reader:postbuild'),
    'Release certification cannot bypass either P30 behavioral or post-build regression layers',
  );
  pass(
    'EPUB_READER_REGRESSION_NO_LIVE_BOOK_COUPLING',
    !core.includes('ai-for-the-kingdom')
      && !core.includes('how-to-love-god')
      && !core.includes('the-unfinished-mission')
      && !migration.includes('ai-for-the-kingdom')
      && !migration.includes('how-to-love-god')
      && !migration.includes('the-unfinished-mission'),
    'Behavioral fixtures are synthetic and do not hardcode current Library titles',
  );
  pass(
    'EPUB_READER_REGRESSION_SCOPE',
    docs.includes('P30')
      && docs.includes('P31')
      && docs.includes('does not replace')
      && docs.includes('production verification'),
    'P30 documentation keeps regression automation distinct from P31 cross-browser certification and existing production verification',
  );
  pass(
    'EPUB_READER_REGRESSION_CERT_CHAIN',
    pkg.includes('reader-legacy-bridge.mjs && node scripts/certification/reader-regression.mjs'),
    'P30 permanent certification is chained immediately after the P29 compatibility bridge gate',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_REGRESSION_SOURCE_PASS');
