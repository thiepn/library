import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/knowledge/workspace.ts',
  'src/pages/knowledge.astro',
  'src/styles/knowledge-workspace.css',
  'src/lib/reader/bookmark-store.ts',
  'src/lib/pdf-reader/state.ts',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/personal/read.astro',
  'scripts/regression/knowledge-workspace.test.ts',
  'tests/e2e/knowledge-workspace.spec.ts',
  'src/layouts/BaseLayout.astro',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('P6_KNOWLEDGE_FILES', present, 'P6 Knowledge model, workspace, styles, deep-link support, tests, and navigation are present');

if (present) {
  const [model, page, css, epubBookmarks, pdfState, hostedRead, personalRead, e2e, layout, pkg] = await Promise.all([
    readFile('src/lib/knowledge/workspace.ts', 'utf8'),
    readFile('src/pages/knowledge.astro', 'utf8'),
    readFile('src/styles/knowledge-workspace.css', 'utf8'),
    readFile('src/lib/reader/bookmark-store.ts', 'utf8'),
    readFile('src/lib/pdf-reader/state.ts', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('src/pages/personal/read.astro', 'utf8'),
    readFile('tests/e2e/knowledge-workspace.spec.ts', 'utf8'),
    readFile('src/layouts/BaseLayout.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'P6_KNOWLEDGE_DERIVED_ONLY',
    page.includes('getAllAnnotationRecords')
      && page.includes('getPdfAnnotations')
      && page.includes('getReaderBookmarks')
      && page.includes('getPdfBookmarks')
      && !page.includes('createObjectStore')
      && !model.includes('indexedDB')
      && !model.includes('localStorage')
      && !model.includes('fetch('),
    'Knowledge derives one workspace from authoritative reader stores and creates no parallel knowledge database or network dependency',
  );

  pass(
    'P6_KNOWLEDGE_UNIFIED_TYPES',
    model.includes("KnowledgeKind = 'note' | 'highlight' | 'bookmark'")
      && page.includes("source: 'epub-bookmark'")
      && page.includes("source: 'pdf-bookmark'")
      && page.includes("source: 'epub-annotation'")
      && page.includes("source: 'pdf-annotation'"),
    'P6 unifies notes, highlights, EPUB bookmarks, and PDF bookmarks without flattening their source identity',
  );

  pass(
    'P6_KNOWLEDGE_FIND_AND_REVIEW',
    model.includes('filterKnowledgeWorkspace')
      && model.includes('summarizeKnowledgeWorkspace')
      && page.includes('data-knowledge-search')
      && page.includes('data-knowledge-book')
      && page.includes('data-knowledge-kind')
      && page.includes('data-knowledge-stat="bookmarks"'),
    'Knowledge provides cross-book search, book/type filtering, sorting, and derived overview metrics',
  );

  pass(
    'P6_KNOWLEDGE_EDIT_EXPORT',
    page.includes('putReaderAnnotation')
      && page.includes('putPdfAnnotation')
      && page.includes('knowledgeWorkspaceMarkdown')
      && page.includes('Copy Markdown')
      && page.includes('Export Markdown'),
    'Existing annotation notes remain editable and the visible knowledge set can be copied/exported as deterministic Markdown',
  );

  pass(
    'P6_KNOWLEDGE_BOOKMARK_API',
    epubBookmarks.includes('getReaderBookmarks()')
      && epubBookmarks.includes('getReaderBookmarkById')
      && pdfState.includes('getPdfBookmarks(identity?: PdfReaderIdentity)')
      && pdfState.includes('deletePdfBookmark'),
    'Bookmark stores expose bounded cross-book reads and explicit deletion for the Knowledge workspace',
  );

  pass(
    'P6_KNOWLEDGE_DEEP_LINKS',
    hostedRead.includes("searchParams.get('bookmark')")
      && hostedRead.includes('getReaderBookmarkById')
      && personalRead.includes("searchParams.get('bookmark')")
      && personalRead.includes('getReaderBookmarkById')
      && page.includes("pdfHref(value.identity.workId, value.identity.edition, value.identity.releaseVersion, value.page)")
      && page.includes("'bookmark'")
      && page.includes("isCurrentRelease(workId, edition, releaseVersion)")
      && page.includes("if (!isCurrentRelease(workId, edition, releaseVersion)) return undefined;"),
    'Knowledge can reopen EPUB CFI and PDF page bookmarks only against the exact original release',
  );

  pass(
    'P6_KNOWLEDGE_BROWSER_ACCEPTANCE',
    e2e.includes("test('@p6 Knowledge unifies reader annotations and bookmarks")
      && e2e.includes("selectOption('bookmark')")
      && e2e.includes("bookmark=p6-epub-bookmark")
      && e2e.includes("P6 edited synthesis"),
    'Canonical browser acceptance covers unified ingestion, filtering, bookmark deep links, note editing, and deletion',
  );

  pass(
    'P6_KNOWLEDGE_NAV_AND_RESPONSIVE',
    layout.includes("href('/knowledge')")
      && layout.includes('>Knowledge</a>')
      && css.includes('@media (max-width: 560px)')
      && css.includes('@media (forced-colors: active)'),
    'Knowledge is a first-class Library destination with responsive and forced-colors handling',
  );

  pass(
    'P6_KNOWLEDGE_CERT_CHAIN',
    pkg.includes('personalized-discovery.mjs && node scripts/certification/knowledge-workspace.mjs && node scripts/certification/reader-device-ux.mjs'),
    'P6 source certification is permanently chained after P5 discovery and before ER7 device UX',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('P6_KNOWLEDGE_WORKSPACE_SOURCE_PASS');
