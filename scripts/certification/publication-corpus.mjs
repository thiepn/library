import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR3_PUBLICATION_COMPATIBILITY.md',
  'tests/compatibility/corpus.json',
  'tests/e2e/compatibility-fixtures.ts',
  'tests/e2e/publication-compatibility.spec.ts',
  'src/lib/publication-compatibility.ts',
  'src/lib/client/personal-books.ts',
  'src/lib/reader/canonical.ts',
  'src/lib/pdf-reader/compatibility-runtime.ts',
  'src/lib/pdf-reader/index.ts',
  '.github/workflows/publication-compatibility.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR3_FILES', present, 'RR3 corpus, generators, runtime contracts, browser tests, workflow, documentation, and package ownership are present');

if (present) {
  const [
    docs, corpusText, fixtures, tests, inspector, personal, epubRuntime, pdfRuntime,
    pdfIndex, workflow, deploy, pkg,
  ] = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const corpus = JSON.parse(corpusText);
  const entries = Array.isArray(corpus.entries) ? corpus.entries : [];
  const ids = entries.map((entry) => entry.id);
  const uniqueIds = new Set(ids);
  const epub = entries.filter((entry) => entry.format === 'epub');
  const pdf = entries.filter((entry) => entry.format === 'pdf');
  const rejected = entries.filter((entry) => entry.expected === 'reject');
  const bounded = entries.filter((entry) => entry.expected === 'bounded');

  pass(
    'RR3_CORPUS_SCHEMA',
    corpus.schemaVersion === 1
      && corpus.phaseId === 'RR3'
      && entries.length >= 20
      && uniqueIds.size === entries.length
      && epub.length >= 12
      && pdf.length >= 8,
    'The machine-readable corpus has unique IDs and broad EPUB/PDF coverage',
  );
  pass(
    'RR3_CORPUS_EXPECTATIONS',
    entries.every((entry) => ['pass', 'degraded', 'reject', 'bounded'].includes(entry.expected))
      && rejected.length >= 9
      && rejected.every((entry) => typeof entry.code === 'string' && entry.code.length > 0)
      && bounded.length >= 2,
    'Every fixture has a bounded pass, degraded, reject, or ready/error expectation and every rejection has a stable code',
  );
  pass(
    'RR3_FIXTURE_OWNERSHIP',
    ids.every((id) => fixtures.includes(id))
      && fixtures.includes('deflateRawSync')
      && fixtures.includes('writeUInt32LE(0x02014b50')
      && fixtures.includes('corruptXrefPdfFixture')
      && fixtures.includes('incrementalPdfFixture'),
    'All corpus entries are deterministic code-generated fixtures, including malformed ZIP and PDF structures',
  );
  pass(
    'RR3_EPUB_BOUNDS',
    inspector.includes('MAX_ARCHIVE_ENTRIES = 10_000')
      && inspector.includes('MAX_EXPANDED_BYTES = 512 * 1024 * 1024')
      && inspector.includes('MAX_ENTRY_BYTES = 128 * 1024 * 1024')
      && inspector.includes('MAX_COMPRESSION_RATIO = 500')
      && inspector.includes("'epub-path-unsafe'")
      && inspector.includes("'epub-compression-ratio-limit'")
      && inspector.includes("'epub-remote-resource'"),
    'EPUB inspection has explicit entry, expansion, per-entry, compression-ratio, traversal, and remote-resource boundaries',
  );
  pass(
    'RR3_EPUB_STRUCTURE',
    inspector.includes("'META-INF/container.xml'")
      && inspector.includes('full-path')
      && inspector.includes('itemRefs')
      && inspector.includes('epub3-navigation')
      && inspector.includes('epub2-ncx')
      && inspector.includes('fixed-layout')
      && inspector.includes('vertical-writing')
      && inspector.includes('scripted-content'),
    'EPUB 2/3 structure, spine resources, navigation, layout, direction/writing mode, and scripted-content classification are inspected',
  );
  pass(
    'RR3_PDF_CLASSIFICATION',
    inspector.includes("'pdf-encrypted'")
      && inspector.includes("'pdf-active-content'")
      && inspector.includes("'pdf-eof-missing'")
      && inspector.includes('incremental-update')
      && inspector.includes("search: 'document-dependent'"),
    'PDF preflight identifies encryption, active content, truncation, incremental updates, and document-dependent text capability',
  );
  pass(
    'RR3_IMPORT_GATE',
    personal.includes('inspectPublication(buffer, format)')
      && personal.indexOf('inspectPublication(buffer, format)') < personal.indexOf('sha256(buffer)')
      && personal.includes('compatibility?: PublicationCompatibilityReport')
      && personal.includes('compatibility,'),
    'Personal imports are inspected before hashing/persistence and retain their compatibility report',
  );
  pass(
    'RR3_RUNTIME_GATE',
    epubRuntime.includes("inspectPublication(candidate.source, 'epub')")
      && epubRuntime.includes('epubCompatibility')
      && pdfRuntime.includes("inspectPublication(candidate.source, 'pdf')")
      && pdfRuntime.includes('pdfDocumentText')
      && pdfRuntime.includes('no searchable text')
      && pdfIndex.includes('mountCompatiblePdfReader as mountPdfReader'),
    'Canonical local EPUB/PDF opens are preflighted and the PDF wrapper exposes image-only search/selection capability',
  );
  pass(
    'RR3_BROWSER_JOURNEYS',
    tests.includes('supported and degraded EPUB classes import')
      && tests.includes('scripted EPUB content remains inert')
      && tests.includes('fail before persistence or network access')
      && tests.includes('image-only')
      && tests.includes('corrupt-xref and incremental PDFs')
      && tests.includes('toMatch(/^(ready|error)$/)'),
    'Browser journeys exercise ordinary, degraded, hostile, script-disabled, image-only, large-page, corrupt-xref, and incremental cases',
  );
  pass(
    'RR3_CI_GATE',
    pkg.includes('"test:compatibility": "playwright test tests/e2e/publication-compatibility.spec.ts"')
      && pkg.includes('publication-corpus.mjs')
      && workflow.includes('pnpm test:compatibility')
      && workflow.includes('chromium firefox webkit')
      && deploy.indexOf('pnpm test:e2e') < deploy.indexOf('Upload certified Library artifact'),
    'RR3 has a dedicated three-engine workflow and remains inside the production browser gate before artifact upload',
  );
  pass(
    'RR3_DOCUMENTATION',
    docs.includes('## Supported and degraded EPUB classes')
      && docs.includes('## Rejected EPUB classes')
      && docs.includes('## PDF classes')
      && docs.includes('## Security and resource boundaries')
      && docs.includes('## Exit criteria'),
    'RR3 documentation publishes support, degradation, rejection, resource, evidence, and exit boundaries',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('RR3_PUBLICATION_CORPUS_SOURCE_PASS');
